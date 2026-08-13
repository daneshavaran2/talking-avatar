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

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
