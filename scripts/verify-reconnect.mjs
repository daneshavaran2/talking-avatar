/**
 * اتصال مجدد خودکار پس از قطعی شبکه (§۱۲.۲ و فاز ۴).
 *
 *   npm run verify:reconnect -- [http://localhost:3000]
 *
 * دو سناریو، هر دو در مرورگر واقعی:
 *
 *   ۱. جریان SSE وسط پاسخ **بریده** می‌شود (بدون رویداد پایانی).
 *      این بدترین حالت است چون از دید HTTP همه‌چیز موفق بوده.
 *   ۲. درخواست در سطح شبکه **رد** می‌شود، مثل قطعی واقعی.
 *
 * در هر دو حالت انتظار داریم: نمایش «در حال اتصال مجدد...»، تلاش
 * دوباره بدون دخالت کاربر، پاسخ کامل، و مهم‌تر از همه **نچسبیدن
 * متن نیمه‌کارهٔ تلاش اول به پاسخ نهایی**.
 *
 * پیش‌نیاز: اپلیکیشن در حال اجرا (و یک مدل، مثلاً سرور نمونه).
 */

import { launchChromium } from './lib/browser.mjs';

const BASE_URL = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000';

const PARTIAL_TEXT = 'نیمه‌کارهٔ‌قطع‌شده';

let failures = 0;
const assert = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

try {
  const response = await fetch(`${BASE_URL}/api/config`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
} catch (error) {
  console.log(`SKIP  اپلیکیشن روی ${BASE_URL} در دسترس نیست (${error.message}).`);
  process.exit(0);
}

const browser = await launchChromium({
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});

/**
 * یک نوبت کامل را با اختلال دلخواه اجرا می‌کند.
 * `breakFirst` تعیین می‌کند اولین درخواست چطور خراب شود.
 */
async function runScenario(breakFirst, breakAll = false) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  let chatRequests = 0;

  await page.route('**/api/chat', async (route) => {
    chatRequests += 1;
    if (chatRequests > 1 && !breakAll) {
      await route.continue();
      return;
    }

    if (breakFirst === 'abort') {
      // قطعی شبکه پیش از رسیدن هر بایتی
      await route.abort('connectionfailed');
      return;
    }

    // جریان بریده: چند توکن واقعی با همان شناسهٔ نوبت، بعد سکوت.
    // شناسه از خود درخواست خوانده می‌شود تا توکن‌ها واقعاً در
    // رابط کاربری بنشینند و بعد ببینیم پاک می‌شوند یا نه.
    const turnId = route.request().postDataJSON()?.turnId ?? '';
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body:
        `event: token\ndata: ${JSON.stringify({ turnId, token: PARTIAL_TEXT })}\n\n` +
        `event: token\ndata: ${JSON.stringify({ turnId, token: ' ادامه.' })}\n\n` +
        // جملهٔ کامل، تا صف صدا هم درگیر شود و بدانیم تلاش دوم
        // واقعاً صدا دارد، نه اینکه صف فکر کند قبلاً پخش کرده.
        `event: sentence\ndata: ${JSON.stringify({ turnId, sentence: `${PARTIAL_TEXT} ادامه.`, index: 0 })}\n\n`,
    });
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // وضعیت‌های دیده‌شده ثبت می‌شوند؛ «در حال اتصال مجدد» گذراست و
  // با یک نگاه در پایان آزمون دیده نمی‌شود.
  await page.evaluate(() => {
    window.__states = [];
    const read = () => document.querySelector('[role="status"]')?.textContent?.trim() ?? '';
    window.__stateTimer = setInterval(() => {
      const now = read();
      if (now && window.__states[window.__states.length - 1] !== now) window.__states.push(now);
    }, 40);
  });

  const composer = 'textarea[aria-label="متن پیام"]';
  await page.click(composer);
  await page.fill(composer, 'ساعت کاری شما چطور است؟');
  await page.keyboard.press('Enter');

  // تلاش دوم پس از Backoff (۶۰۰ms) شروع می‌شود.
  await page.waitForTimeout(9000);

  const observed = await page.evaluate(() => {
    clearInterval(window.__stateTimer);
    return {
      states: window.__states,
      text: document.body.innerText,
      thinkingBubbles: document.querySelectorAll('[data-slot="thinking"]').length,
    };
  });

  await page.close();
  return { ...observed, chatRequests, pageErrors };
}

// ── سناریو ۱: جریان بریده ──────────────────────────────────────
console.log('\n── جریان SSE وسط پاسخ بریده می‌شود ──────────');
{
  const result = await runScenario('truncate');
  console.log(`درخواست‌های چت: ${result.chatRequests} · وضعیت‌ها: ${result.states.join(' → ')}\n`);

  assert('no page errors', result.pageErrors.length === 0, result.pageErrors.join('; '));
  assert('قطعی تشخیص داده شد و دوباره تلاش کرد', result.chatRequests >= 2, `${result.chatRequests} درخواست`);
  assert(
    'به کاربر «در حال اتصال مجدد» نشان داد',
    result.states.some((state) => state.includes('اتصال مجدد')),
    result.states.join(' → '),
  );
  assert('پاسخ کامل در نهایت رسید', result.text.includes('ساعت کاری ما از نه صبح'));
  assert('متن نیمه‌کارهٔ تلاش اول پاک شد', !result.text.includes(PARTIAL_TEXT));
  assert('در حالت خطا گیر نکرد', !result.states[result.states.length - 1]?.includes('خطا'));
}

// ── سناریو ۲: قطعی شبکه ────────────────────────────────────────
console.log('\n── درخواست در سطح شبکه رد می‌شود ────────────');
{
  const result = await runScenario('abort');
  console.log(`درخواست‌های چت: ${result.chatRequests} · وضعیت‌ها: ${result.states.join(' → ')}\n`);

  assert('no page errors', result.pageErrors.length === 0, result.pageErrors.join('; '));
  assert('دوباره تلاش کرد', result.chatRequests >= 2, `${result.chatRequests} درخواست`);
  assert(
    'به کاربر «در حال اتصال مجدد» نشان داد',
    result.states.some((state) => state.includes('اتصال مجدد')),
    result.states.join(' → '),
  );
  assert('پاسخ کامل در نهایت رسید', result.text.includes('ساعت کاری ما از نه صبح'));
}

// ── سناریو ۳: قطعی که برطرف نمی‌شود ───────────────────────────
console.log('\n── قطعی پایدار: اعلام صادقانه پس از تلاش‌ها ─');
{
  const result = await runScenario('abort', true);
  console.log(`درخواست‌های چت: ${result.chatRequests} · وضعیت‌ها: ${result.states.join(' → ')}\n`);

  assert('no page errors', result.pageErrors.length === 0, result.pageErrors.join('; '));
  assert('سه بار تلاش کرد و بس', result.chatRequests === 3, `${result.chatRequests} درخواست`);
  assert(
    'در نهایت صادقانه اعلام خطا کرد',
    result.text.includes('ارتباط با سرور قطع شد'),
    result.states.join(' → '),
  );
  assert(
    'حباب «در حال فکر کردن» جا نماند',
    result.thinkingBubbles === 0,
    `${result.thinkingBubbles} حباب`,
  );
}

await browser.close();

console.log(`\n${failures === 0 ? 'AUTO-RECONNECT PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
