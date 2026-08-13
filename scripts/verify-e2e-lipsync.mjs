/**
 * آزمون یکپارچهٔ زنجیرهٔ کامل گفتار (§F6 + §F7).
 *
 *   npm run verify:e2e -- [http://localhost:3000]
 *
 * برخلاف `verify:lipsync` که رندرر را جدا و مستقیم می‌سنجد، این
 * آزمون هیچ تابعی را مستقیم صدا نمی‌زند: فقط در رابط کاربری تایپ
 * می‌کند و پیکسل‌های بوم آواتار را در طول زمان نمونه‌برداری می‌کند.
 * یعنی کل مسیر واقعی را می‌سنجد:
 *
 *   پیام → مدل زبانی → جملهٔ کامل → TTS → صف صدا →
 *   زمان‌بندی روی ساعت AudioContext → رندر دهان
 *
 * پیش‌نیاز: اپلیکیشن باید در حال اجرا باشد، آواتار عکس داشته باشد،
 * و TTS پیکربندی شده باشد. اگر هرکدام نبود، آزمون با پیام روشن
 * **رد می‌شود، نه شکست** — چون نبودِ کلید سرویس ایراد کد نیست.
 *
 * ── آزمون بدون سرویس ابری ────────────────────────────────────
 * سرور نمونهٔ زیر هر سه پروتکل لازم را پیاده می‌کند (Ollama برای
 * مدل و تعبیه‌سازی، media-engine برای TTS) و WAV واقعی می‌سازد:
 *
 *   node scripts/stub-services.mjs        # روی پورت ۱۱۵۰۰
 *
 * و در .env:
 *   LLM_PROVIDER=ollama         LLM_BASE_URL=http://localhost:11500
 *   EMBEDDING_PROVIDER=ollama   EMBEDDING_BASE_URL=http://localhost:11500
 *   TTS_PROVIDER=media-engine   MEDIA_ENGINE_URL=http://localhost:11500
 *
 * با این پیکربندی، کد واقعی OllamaProvider و MediaEngineTtsProvider
 * اجرا می‌شود — چیزی شبیه‌سازی نشده جز خود سرویس بیرونی.
 */

import { chromium } from 'playwright';

const BASE_URL = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000';
const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const QUESTION = process.env.E2E_QUESTION ?? 'ساعت کاری شما چطور است؟';

let failures = 0;
const assert = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const round = (n) => Math.round(n * 100) / 100;

// ── بررسی پیش‌نیازها پیش از بالا آوردن مرورگر ──────────────────
let config;
try {
  const response = await fetch(`${BASE_URL}/api/config`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  config = await response.json();
} catch (error) {
  console.log(`SKIP  اپلیکیشن روی ${BASE_URL} در دسترس نیست (${error.message}).`);
  console.log('      ابتدا `npm start` را اجرا کنید.');
  process.exit(0);
}

if (!config.avatar?.imageUrl) {
  console.log('SKIP  آواتار عکس ندارد. از /admin/avatar یک عکس آپلود کنید.');
  process.exit(0);
}

if (!config.speech?.ttsAvailable) {
  console.log('SKIP  TTS پیکربندی نشده است، پس صدایی برای هماهنگی وجود ندارد.');
  console.log('      TTS_PROVIDER را تنظیم کنید یا سرور نمونه را بالا بیاورید');
  console.log('      (راهنما در بالای همین فایل).');
  process.exit(0);
}

// ── اجرای مرورگر ───────────────────────────────────────────────
const browser = await chromium.launch({
  executablePath: CHROMIUM_PATH,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});

const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

// محدودیت نرخ اپلیکیشن روی /api/chat فعال است. اگر چند مجموعه آزمون
// پشت سر هم اجرا شوند ممکن است به سقف بخوریم؛ آن‌وقت دهانی تکان
// نمی‌خورد چون اصلاً پاسخی تولید نشده. این «شکست» نیست، پس جدا
// تشخیص داده می‌شود تا نتیجهٔ گمراه‌کننده گزارش نشود.
let rateLimited = false;
page.on('response', (response) => {
  if (response.url().includes('/api/chat') && response.status() === 429) rateLimited = true;
});

await page.goto(BASE_URL, { waitUntil: 'networkidle' });

const started = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  if (!canvas) return false;

  const ctx = canvas.getContext('2d');
  window.__samples = [];
  window.__sampler = setInterval(() => {
    const box = ctx.getImageData(
      Math.round(canvas.width * 0.4),
      Math.round(canvas.height * 0.64),
      Math.round(canvas.width * 0.2),
      Math.round(canvas.height * 0.12),
    );
    let sum = 0;
    for (let i = 0; i < box.data.length; i += 4) {
      sum += 0.299 * box.data[i] + 0.587 * box.data[i + 1] + 0.114 * box.data[i + 2];
    }
    window.__samples.push(sum / (box.data.length / 4));
  }, 45);
  return true;
});

if (!started) {
  await browser.close();
  console.log('SKIP  بوم آواتار پیدا نشد (شاید حلقهٔ Idle ویدئویی فعال است).');
  process.exit(0);
}

// نمونه‌های پایه، پیش از هر صحبتی
await page.waitForTimeout(900);
const baselineCount = await page.evaluate(() => window.__samples.length);

// کلیک و تایپ — تعامل کاربر قفل Web Audio را باز می‌کند
const composer = 'textarea[aria-label="متن پیام"]';
await page.click(composer);
await page.fill(composer, QUESTION);
await page.keyboard.press('Enter');

// انتظار تطبیقی: تا وقتی دهان آرام نشده صبر می‌کنیم. با زمان ثابت،
// یک پاسخ بلندتر «شکست» گزارش می‌شد در حالی که فقط هنوز تمام نشده بود.
const MAX_WAIT_MS = Number(process.env.E2E_MAX_WAIT_MS ?? 25_000);
const QUIET_MS = 1600;
const deadline = Date.now() + MAX_WAIT_MS;

await page.waitForTimeout(3000); // فرصت شروع پخش
while (Date.now() < deadline) {
  const stillMoving = await page.evaluate((quietSamples) => {
    const tail = window.__samples.slice(-quietSamples);
    if (tail.length < quietSamples) return true;
    return Math.max(...tail) - Math.min(...tail) > 8;
  }, Math.ceil(QUIET_MS / 45));

  if (!stillMoving) break;
  await page.waitForTimeout(300);
}

const samples = await page.evaluate(() => {
  clearInterval(window.__sampler);
  return window.__samples;
});

await browser.close();

if (rateLimited) {
  console.log('SKIP  اپلیکیشن با ۴۲۹ (محدودیت نرخ) پاسخ داد، پس صدایی تولید نشد.');
  console.log('      یک دقیقه صبر کنید و دوباره اجرا کنید.');
  process.exit(0);
}

// ── تحلیل ──────────────────────────────────────────────────────
const baseline = samples.slice(0, baselineCount);
const during = samples.slice(baselineCount);

const spread = (rows) => (rows.length ? Math.max(...rows) - Math.min(...rows) : 0);
const mean = (rows) => (rows.length ? rows.reduce((s, v) => s + v, 0) / rows.length : 0);

const baselineMean = mean(baseline);
const baselineSpread = spread(baseline);
const activeSpread = spread(during);
const darkest = during.length ? Math.min(...during) : baselineMean;
const tailMean = mean(during.slice(-18));

console.log(`\nنمونه‌ها: ${baseline.length} پایه + ${during.length} حین پاسخ`);
console.log(`روشنایی پایه   : ${round(baselineMean)} (پراکندگی ${round(baselineSpread)})`);
console.log(`تیره‌ترین لحظه : ${round(darkest)}`);
console.log(`پایان پخش      : ${round(tailMean)} (پراکندگی حین پخش ${round(activeSpread)})\n`);

assert('no page errors', pageErrors.length === 0, pageErrors.join('; '));
assert('mouth is quiet before speaking', baselineSpread < 8, `spread=${round(baselineSpread)}`);
assert(
  'mouth moves while audio plays',
  activeSpread > baselineSpread + 15,
  `during=${round(activeSpread)} baseline=${round(baselineSpread)}`,
);
assert(
  'mouth opens clearly at some point',
  darkest < baselineMean - 12,
  `darkest=${round(darkest)} baseline=${round(baselineMean)}`,
);
assert(
  'mouth closes again after audio ends',
  Math.abs(tailMean - baselineMean) < 12,
  `tail=${round(tailMean)} baseline=${round(baselineMean)}`,
);

console.log(`\n${failures === 0 ? 'END-TO-END LIP-SYNC PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
