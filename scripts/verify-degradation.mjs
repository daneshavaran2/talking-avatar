/**
 * تنزل تدریجی سمت کلاینت (§۱۲.۱ و §۱۲.۲).
 *
 *   npm run verify:degradation -- [http://localhost:3000]
 *
 * سناریو: TTS وسط کار می‌خوابد. طبق سند باید «فقط متن نمایش داده
 * شود» — یعنی:
 *
 *   • پاسخ کامل در گفتگو دیده شود
 *   • یک اعلان کوتاه دربارهٔ نبود صدا، **نه** یک اعلان به‌ازای هر جمله
 *   • مکالمه به حالت خطا نرود؛ کاربر بتواند بلافاصله سؤال بعدی را بپرسد
 *
 * پیش‌نیاز: اپلیکیشن در حال اجرا + سرور نمونه با مسیر `/__control`:
 *   node scripts/stub-services.mjs
 */

import { launchChromium } from './lib/browser.mjs';

const BASE_URL = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000';
const STUB_URL = (process.env.MEDIA_ENGINE_URL ?? 'http://localhost:11500').replace(/\/$/, '');

let failures = 0;
const assert = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── پیش‌نیازها ─────────────────────────────────────────────────
let config;
try {
  const response = await fetch(`${BASE_URL}/api/config`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  config = await response.json();
} catch (error) {
  console.log(`SKIP  اپلیکیشن روی ${BASE_URL} در دسترس نیست (${error.message}).`);
  process.exit(0);
}

if (!config.speech?.ttsAvailable) {
  console.log('SKIP  TTS پیکربندی نشده، پس چیزی برای «خراب شدن» وجود ندارد.');
  process.exit(0);
}

const breakTts = async (failNext) => {
  const response = await fetch(`${STUB_URL}/__control`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ failNext, status: 503, path: '/tts/stream' }),
  });
  if (!response.ok) throw new Error(`سرور نمونه مسیر /__control ندارد (HTTP ${response.status}).`);
};

try {
  await breakTts(0);
} catch (error) {
  console.log(`SKIP  ${error.message}`);
  process.exit(0);
}

// ── اجرا ───────────────────────────────────────────────────────
const browser = await launchChromium({
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});

const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

// شمارش درخواست‌های TTS: باید فقط یکی باشد، نه یکی به‌ازای هر جمله.
let ttsRequests = 0;
page.on('request', (request) => {
  if (request.url().includes('/api/speech/tts')) ttsRequests += 1;
});

await page.goto(BASE_URL, { waitUntil: 'networkidle' });

// اعلان‌های sonner خودشان پس از چند ثانیه محو می‌شوند، پس شمردنِ
// آن‌ها در پایان آزمون همیشه صفر می‌دهد. به‌جایش از لحظهٔ افزوده
// شدن ثبتشان می‌کنیم.
await page.evaluate(() => {
  window.__toasts = [];
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        const toast = node.matches?.('[data-sonner-toast]')
          ? node
          : node.querySelector?.('[data-sonner-toast]');
        if (toast) window.__toasts.push(toast.textContent ?? '');
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
});

// همهٔ درخواست‌های TTS این نوبت شکست می‌خورند.
await breakTts(50);

const composer = 'textarea[aria-label="متن پیام"]';
await page.click(composer);
await page.fill(composer, 'چه خدماتی ارائه می‌دهید؟');
await page.keyboard.press('Enter');

await page.waitForTimeout(8000);

const observed = await page.evaluate(() => ({
  text: document.body.innerText,
  toasts: window.__toasts,
  alerts: Array.from(document.querySelectorAll('[role="alert"]'))
    .map((node) => node.textContent?.trim() ?? '')
    .filter(Boolean)
    // خودِ اعلان sonner هم role=alert دارد؛ اینجا دنبال هشدار قرمزِ
    // داخل گفتگو هستیم، نه اعلان گذرا.
    .filter((text) => !text.includes('صدا موقتاً در دسترس نیست')),
  composerDisabled: document.querySelector('textarea[aria-label="متن پیام"]')?.disabled ?? true,
}));

await breakTts(0);
await browser.close();

// ── تحلیل ──────────────────────────────────────────────────────
// پاسخ شش جمله دارد؛ اگر صف پس از اولین شکست متوقف نمی‌شد، به ازای
// هر جمله یک درخواست و یک اعلان می‌رفت.
const sentences = 6;

console.log(
  `\nدرخواست‌های TTS: ${ttsRequests} از ${sentences} جمله · اعلان‌ها: ${observed.toasts.length}\n`,
);

assert('no page errors', pageErrors.length === 0, pageErrors.join('; '));
assert(
  'پاسخ با وجود خرابی TTS نمایش داده شد',
  observed.text.includes('نصب و راه‌اندازی'),
  observed.text.slice(-120).replace(/\n/g, ' '),
);
// جمله‌های اولِ پاسخ تقریباً هم‌زمان به صف می‌رسند، پس ممکن است چند
// درخواست پیش از دیده شدن اولین شکست بیرون رفته باشد. چیزی که مهم
// است: تعداد با تعداد جمله‌ها رشد نمی‌کند.
assert(
  'صف پس از اولین شکست دست از تلاش برداشت',
  ttsRequests < sentences,
  `${ttsRequests} درخواست برای ${sentences} جمله`,
);
assert(
  'فقط یک اعلان نمایش داده شد، نه یکی به‌ازای هر جمله',
  observed.toasts.length === 1,
  observed.toasts.join(' | '),
);
assert(
  'اعلان دربارهٔ صداست، نه یک خطای کلی',
  (observed.toasts[0] ?? '').includes('صدا موقتاً در دسترس نیست'),
  observed.toasts[0] ?? '',
);
assert('مکالمه به حالت خطا نرفت', observed.alerts.length === 0, observed.alerts.join(' | '));
assert('کاربر می‌تواند بلافاصله سؤال بعدی را بپرسد', observed.composerDisabled === false);

console.log(`\n${failures === 0 ? 'GRACEFUL DEGRADATION PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
