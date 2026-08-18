/* بررسی دستی منطق هسته — اجرا با tsx */
import { SentenceSplitter } from '@/lib/conversation/sentence-splitter';
import {
  normalizePersian,
  normalizeForMatching,
  estimateTokens,
} from '@/lib/text/persian';
import { classifyTopic } from '@/lib/analytics/topics';
import { chunkPages } from '@/lib/rag/chunk';
import {
  buildVisemeTimeline,
  sampleViseme,
  textToVisemes,
  VISEME_SHAPES,
} from '@/lib/lipsync/visemes';
import { geometryFromLandmarks, parseFaceGeometry } from '@/lib/lipsync/geometry';
import {
  CATEGORY_PATTERNS,
  INJECTION_PATTERNS,
  OUTPUT_PATTERNS,
} from '@/lib/guardrails/patterns';
import {
  backoffDelayMs,
  fetchWithRetry,
  isRetryableError,
  isRetryableStatus,
  retryAfterMs,
} from '@/lib/http/retry';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`);
}

console.log('\n── SentenceSplitter ──────────────────────────');
{
  const s = new SentenceSplitter();
  check('split on Persian question mark', s.push('سلام. حالت چطوره؟ خوبم'), [
    'سلام.',
    'حالت چطوره؟',
  ]);
  check('remainder buffered', s.pending, ' خوبم');
  check('flush returns remainder', s.flush(), 'خوبم');
}
{
  const s = new SentenceSplitter();
  check('decimal not split', s.push('قیمت ۳.۵ میلیون تومان است.'), ['قیمت ۳.۵ میلیون تومان است.']);
}
{
  const s = new SentenceSplitter();
  check('token-by-token assembly', ['سلا', 'م د', 'نیا.'].flatMap((t) => s.push(t)), ['سلام دنیا.']);
}
{
  const s = new SentenceSplitter();
  const long = 'الف '.repeat(80); // ~۳۲۰ کاراکتر بدون علامت پایانی
  const out = s.push(long);
  check('force-breaks over-long text', out.length > 0, true);
}
{
  const s = new SentenceSplitter();
  check('closing quote stays with sentence', s.push('او گفت «سلام.» بعد رفت.'), [
    'او گفت «سلام.»',
    'بعد رفت.',
  ]);
}

console.log('\n── Persian normalisation ─────────────────────');
check('arabic yeh/kaf folded', normalizeForMatching('كتاب‌های يك نفر'), 'کتاب های یک نفر');
check('digits folded to latin', normalizeForMatching('سفارش ۱۲۳ و ٤٥٦'), 'سفارش 123 و 456');
check('punctuation stripped for matching', normalizeForMatching('قیمت؟ چند!'), 'قیمت چند');
check('display normalisation keeps ZWNJ', normalizePersian('كتاب‌هاي من').includes('‌'), true);
check('space before punctuation removed', normalizePersian('سلام ، خوبی'), 'سلام، خوبی');
check('token estimate', estimateTokens('سلام دنیا'), 3);
check('alef with madda folded', normalizeForMatching('آدرس منزل'), 'ادرس منزل');
// پیشوند فعلی «می» با هر دو املا باید به یک رشته برسد، وگرنه
// کلیدواژه‌ای که با یکی نوشته شده با دیگری تطبیق نمی‌خورد.
check('mi- prefix glued (ZWNJ form)', normalizeForMatching('توصیه می‌کنم'), 'توصیه میکنم');
check('mi- prefix glued (spaced form)', normalizeForMatching('توصیه می کنم'), 'توصیه میکنم');
check('nemi- prefix glued', normalizeForMatching('نمی‌دانم'), 'نمیدانم');
check('word starting with mi untouched', normalizeForMatching('تیمی که آمد'), 'تیمی که امد');

console.log('\n── Guardrail patterns ────────────────────────');
{
  // هر الگو باید با املای طبیعی خودش هم تطبیق بخورد. اگر الگویی
  // «میکنم» نوشته شده ولی متن واقعی «می‌کنم» است، آن الگو عملاً
  // مرده است — این بررسی دقیقاً همان اشتباه را می‌گیرد.
  const tables: Array<[string, string[]]> = [
    ...Object.entries(CATEGORY_PATTERNS),
    ['injection', INJECTION_PATTERNS],
    ...Object.entries(OUTPUT_PATTERNS).map(([k, v]) => [k, v ?? []] as [string, string[]]),
  ];

  const dead: string[] = [];
  for (const [table, patterns] of tables) {
    for (const pattern of patterns) {
      // املای طبیعی: پیشوند «می»/«نمی» با نیم‌فاصله نوشته می‌شود.
      const natural = pattern.replace(/(^| )(ن?می)(?=\p{L})/gu, '$1$2‌');
      const haystack = normalizeForMatching(`قبلش ${natural} بعدش`);
      if (!haystack.includes(normalizeForMatching(pattern))) dead.push(`${table}: ${pattern}`);
    }
  }
  check('every pattern matches its natural spelling', dead, []);
}

console.log('\n── Topic classification ──────────────────────');
check('pricing', classifyTopic('قیمت این محصول چند تومان است؟'), 'pricing');
check('orders', classifyTopic('سفارش من کی ارسال میشه؟'), 'orders');
check('support', classifyTopic('دستگاه خراب شده و کار نمیکنه'), 'support');
check('booking', classifyTopic('میخوام یک نوبت مشاوره رزرو کنم'), 'booking');
check('greeting short', classifyTopic('سلام'), 'greeting');
check('greeting prefix does not swallow real question', classifyTopic('سلام میخواستم بپرسم سفارش من کی ارسال میشود'), 'orders');
check('unknown falls back to other', classifyTopic('هوا امروز چطور است'), 'other');

console.log('\n── Chunking ──────────────────────────────────');
{
  const paragraph = 'این یک پاراگراف نمونه است که محتوای مشخصی دارد و برای آزمون قطعه‌بندی نوشته شده. '.repeat(12);
  const chunks = chunkPages([
    { page: 1, text: `عنوان بخش اول\n\n${paragraph}\n\n${paragraph}` },
    { page: 2, text: `عنوان بخش دوم\n\n${paragraph}` },
  ]);

  check('produced multiple chunks', chunks.length > 1, true);
  check('all chunks under max tokens', chunks.every((c) => c.tokenCount <= 900), true);
  check('page metadata preserved', chunks.some((c) => c.page === 2), true);
  check('section metadata captured', chunks.some((c) => c.section?.includes('عنوان')), true);
  check('ordinals sequential', chunks.map((c) => c.ordinal), chunks.map((_, i) => i));
  console.log(`      (${chunks.length} chunks, tokens: ${chunks.map((c) => c.tokenCount).join(', ')})`);
}

console.log('\n── Lip-sync: Persian grapheme → viseme ───────');
check('bilabial closure', textToVisemes('بم'), ['PP', 'E', 'PP']);
check('labiodental', textToVisemes('ف'), ['FF']);
check(
  'Persian ث/ذ/ظ are alveolar, not dental',
  textToVisemes('ثذظ'),
  ['DD', 'E', 'DD', 'E', 'DD'],
);
check('postalveolar rounding', textToVisemes('شج'), ['CH', 'E', 'CH']);
check('velar', textToVisemes('کگ'), ['KK', 'E', 'KK']);
check('long vowels', textToVisemes('اوی'), ['AA', 'OU', 'IH']);
check('word gap becomes silence', textToVisemes('با ما'), ['PP', 'AA', 'sil', 'PP', 'AA']);
check('punctuation becomes silence', textToVisemes('با.'), ['PP', 'AA', 'sil']);
{
  // مصوت کوتاهِ نانوشته باید تزریق شود وگرنه دهان روی «مدرسه» بسته می‌ماند
  const sequence = textToVisemes('مدرسه');
  check('unwritten short vowel injected', sequence.includes('E'), true);
  check('no two consonant visemes adjacent',
    sequence.every((v, i) => {
      if (i === 0) return true;
      const vowels = new Set(['AA', 'E', 'IH', 'OH', 'OU', 'sil']);
      return vowels.has(v) || vowels.has(sequence[i - 1]!);
    }),
    true);
  console.log(`      (مدرسه → ${sequence.join(' ')})`);
}

console.log('\n── Lip-sync: timeline ────────────────────────');
{
  const frames = buildVisemeTimeline('سلام دنیا.', 2000);
  check('timeline non-empty', frames.length > 3, true);
  check('starts at zero', frames[0]!.startMs, 0);
  check('ends exactly at audio duration', frames[frames.length - 1]!.endMs, 2000);
  check(
    'frames are contiguous (no gaps or overlaps)',
    frames.every((f, i) => i === 0 || Math.abs(f.startMs - frames[i - 1]!.endMs) < 1e-9),
    true,
  );
  check(
    'vowels last longer than stops',
    (() => {
      const vowel = frames.find((f) => f.viseme === 'AA');
      const stop = frames.find((f) => f.viseme === 'PP' || f.viseme === 'DD');
      return vowel && stop ? vowel.endMs - vowel.startMs > stop.endMs - stop.startMs : false;
    })(),
    true,
  );
  console.log(`      (${frames.length} frames over 2000ms)`);
}
{
  // تضمین اینکه هیچ جمله‌ای دهان را پس از پایان صدا باز نگه ندارد
  const frames = buildVisemeTimeline('سلام.', 800);
  check('mouth closed after audio ends', sampleViseme(frames, 900), VISEME_SHAPES.sil);
  check('mouth moving during audio', sampleViseme(frames, 200).open > 0, true);
}
{
  // دقت هماهنگی: نمونه‌برداری در هر لحظه باید ویزیمی را بدهد که
  // بازه‌اش آن لحظه را در بر می‌گیرد (خطای صفر در خود مدل).
  const frames = buildVisemeTimeline('محصولات ما گارانتی دارند.', 3000);
  let maxDriftMs = 0;
  for (let t = 0; t < 3000; t += 7) {
    const frame = frames.find((f) => t >= f.startMs && t < f.endMs);
    if (!frame) continue;
    const shape = sampleViseme(frames, t);
    // در ۵۵٪ ابتدایی هر ویزیم، شکل باید دقیقاً همان ویزیم باشد
    const progress = (t - frame.startMs) / (frame.endMs - frame.startMs);
    if (progress < 0.5) {
      const expected = VISEME_SHAPES[frame.viseme];
      if (JSON.stringify(shape) !== JSON.stringify(expected)) {
        maxDriftMs = Math.max(maxDriftMs, frame.endMs - frame.startMs);
      }
    }
  }
  check('no drift between timeline and sampler', maxDriftMs, 0);
}

console.log('\n── Lip-sync: face geometry ───────────────────');
check('rejects malformed geometry', parseFaceGeometry({ mouth: 'nope' }), null);
check('rejects short landmark arrays', geometryFromLandmarks([[0.5, 0.5, 0]]), null);
{
  const geometry = parseFaceGeometry({
    mouth: { x: 0.5, y: 0.7, width: 0.2, height: 0.08 },
    leftEye: { x: 0.38, y: 0.44, width: 0.12, height: 0.05 },
    rightEye: { x: 0.62, y: 0.44, width: 0.12, height: 0.05 },
    chinY: 0.88,
  });
  check('accepts valid geometry', geometry?.mouth.y, 0.7);
  check('defaults chinY when absent',
    parseFaceGeometry({
      mouth: { x: 0.5, y: 0.7, width: 0.2, height: 0.08 },
      leftEye: { x: 0.38, y: 0.44, width: 0.12, height: 0.05 },
      rightEye: { x: 0.62, y: 0.44, width: 0.12, height: 0.05 },
    })?.chinY,
    0.88);
}
{
  // نقاط کلیدی ساختگی MediaPipe: دهان حول y=0.7، چشم‌ها حول y=0.44
  const landmarks = Array.from({ length: 468 }, () => [0.5, 0.5, 0] as [number, number, number]);
  for (const i of [61, 291, 13, 14, 78, 308, 0, 17]) landmarks[i] = [0.42 + Math.random() * 0.16, 0.68 + Math.random() * 0.04, 0];
  for (const i of [33, 133, 159, 145]) landmarks[i] = [0.32 + Math.random() * 0.1, 0.42 + Math.random() * 0.03, 0];
  for (const i of [362, 263, 386, 374]) landmarks[i] = [0.58 + Math.random() * 0.1, 0.42 + Math.random() * 0.03, 0];
  landmarks[152] = [0.5, 0.9, 0];

  const geometry = geometryFromLandmarks(landmarks);
  check('builds geometry from landmarks', geometry !== null, true);
  check('mouth sits in lower face', geometry !== null && geometry.mouth.y > 0.6 && geometry.mouth.y < 0.8, true);
  check('eyes sit above mouth', geometry !== null && geometry.leftEye.y < geometry.mouth.y, true);
  check('chin below mouth', geometry !== null && geometry.chinY > geometry.mouth.y, true);
}

console.log('\n── Retry / backoff (E4) ──────────────────────');
{
  check('transient statuses are retryable', [429, 500, 502, 503, 504].map(isRetryableStatus), [
    true, true, true, true, true,
  ]);
  check('permanent statuses are not', [400, 401, 403, 404, 409, 422].map(isRetryableStatus), [
    false, false, false, false, false, false,
  ]);

  // لغو کاربر (Barge-In) هرگز نباید تلاش مجدد شود.
  const abortError = new DOMException('لغو شد', 'AbortError');
  check('abort is never retried', isRetryableError(abortError), false);
  check('timeout is retried', isRetryableError(new DOMException('دیر شد', 'TimeoutError')), true);
  check('plain error is not retried', isRetryableError(new Error('bad json')), false);
  {
    const network = new TypeError('fetch failed');
    (network as Error & { cause?: unknown }).cause = { code: 'ECONNRESET' };
    check('socket reset is retried', isRetryableError(network), true);
  }

  // تأخیر باید نمایی رشد کند، هرگز صفر نشود، و از سقف رد نشود.
  const policy = { attempts: 4, baseDelayMs: 400, maxDelayMs: 4000 };
  check('backoff floor is half the ceiling', backoffDelayMs(0, policy, () => 0), 200);
  check('backoff ceiling respected at attempt 0', backoffDelayMs(0, policy, () => 1), 400);
  check('backoff grows exponentially', backoffDelayMs(2, policy, () => 1), 1600);
  check('backoff clamped to max', backoffDelayMs(10, policy, () => 1), 4000);

  const withHeader = (value: string) =>
    retryAfterMs(new Response(null, { headers: { 'retry-after': value } }), 0);
  check('retry-after in seconds', withHeader('2'), 2000);
  check('retry-after as date', withHeader(new Date(5000).toUTCString()), 5000);
  check('no retry-after header', retryAfterMs(new Response(null)), null);
}

// ── تلاش مجدد روی سوکت واقعی ───────────────────────────────────
// سرور موقتی درون همین فرایند بالا می‌آید تا رفتار واقعی `fetch`
// سنجیده شود، نه یک شبیه‌سازی از آن. این بخش ناهمگام است، پس در
// یک تابع بسته شده (tsx اینجا به CJS ترجمه می‌کند و top-level await
// ندارد) و خلاصهٔ نهایی هم داخل همان اجرا می‌شود.
async function socketChecks(): Promise<void> {
  console.log('\n── Test harness: chromium resolution ─────────');
  {
    // این بررسی محصول را نمی‌سنجد، بلکه خودِ ابزار آزمون را.
    // اشتباهی که می‌گیرد ظریف است: مسیر ثابتِ مرورگر روی ماشین توسعه
    // کار می‌کند و همه‌جای دیگر — از جمله CI — بی‌صدا می‌شکند.
    const { chromiumExecutablePath } = (await import('./lib/browser.mjs')) as {
      chromiumExecutablePath: (presetPath?: string) => string | undefined;
    };

    const previous = process.env.CHROMIUM_PATH;
    delete process.env.CHROMIUM_PATH;

    check(
      'falls back to Playwright when no preset exists',
      chromiumExecutablePath('/definitely/not/here'),
      undefined,
    );

    process.env.CHROMIUM_PATH = '/custom/chrome';
    check('explicit CHROMIUM_PATH wins', chromiumExecutablePath('/definitely/not/here'), '/custom/chrome');

    if (previous === undefined) delete process.env.CHROMIUM_PATH;
    else process.env.CHROMIUM_PATH = previous;
  }

  console.log('\n── Retry against a real socket ───────────────');
  const hits: Record<string, number> = {};

  const server = createServer((request, response) => {
    const path = (request.url ?? '').split('?')[0] ?? '';
    hits[path] = (hits[path] ?? 0) + 1;

    if (path === '/flaky') {
      // دو بار خطای گذرا، بار سوم موفق.
      if ((hits[path] ?? 0) < 3) {
        response.writeHead(503).end('unavailable');
        return;
      }
      response.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }

    if (path === '/permanent') {
      response.writeHead(400).end('bad request');
      return;
    }

    if (path === '/slow-hint') {
      response.writeHead(503, { 'retry-after': '600' }).end('come back later');
      return;
    }

    if (path === '/always-503') {
      response.writeHead(503).end('unavailable');
      return;
    }

    response.writeHead(404).end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const fast = { attempts: 3, baseDelayMs: 20, maxDelayMs: 60 };

  {
    const response = await fetchWithRetry(`${base}/flaky`, {}, { policy: fast });
    check('transient failure eventually succeeds', response.status, 200);
    check('it really retried twice', hits['/flaky'], 3);
  }

  {
    const response = await fetchWithRetry(`${base}/permanent`, {}, { policy: fast });
    check('permanent failure returns immediately', response.status, 400);
    check('permanent failure sent one request only', hits['/permanent'], 1);
  }

  {
    // سرویس می‌گوید ده دقیقه دیگر برگرد؛ انتظار بی‌فایده است.
    const response = await fetchWithRetry(`${base}/slow-hint`, {}, { policy: fast });
    check('long retry-after is not waited out', response.status, 503);
    check('long retry-after sent one request only', hits['/slow-hint'], 1);
  }

  {
    // آخرین تلاش هم که شکست بخورد، همان پاسخ ناموفق برمی‌گردد —
    // خطا پنهان نمی‌شود.
    const response = await fetchWithRetry(`${base}/always-503`, {}, { policy: fast });
    check('exhausted retries return the failure', response.status, 503);
    check('all attempts were used', hits['/always-503'], fast.attempts);
  }

  {
    // Barge-In وسط Backoff: باید فوراً برگردد، نه پس از پایان تایمر.
    const controller = new AbortController();
    const before = hits['/always-503'] ?? 0;
    setTimeout(() => controller.abort(), 50);

    const startedAt = Date.now();
    let aborted = false;
    await fetchWithRetry(
      `${base}/always-503`,
      {},
      {
        policy: { attempts: 3, baseDelayMs: 5000, maxDelayMs: 9000 },
        signal: controller.signal,
      },
    ).catch((error: unknown) => {
      aborted = error instanceof Error && error.name === 'AbortError';
    });
    const elapsed = Date.now() - startedAt;

    check('abort during backoff rejects', aborted, true);
    check('abort does not wait out the timer', elapsed < 1000, true);
    check('abort stops further attempts', (hits['/always-503'] ?? 0) - before, 1);
  }

  await new Promise<void>((resolve) => server.close(() => resolve()));
}

void socketChecks()
  .catch((error: unknown) => {
    failures += 1;
    console.log(`FAIL  socket checks crashed — ${error instanceof Error ? error.message : error}`);
  })
  .then(() => {
    console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
    process.exit(failures === 0 ? 0 : 1);
  });
