/**
 * تلاش مجدد خودکار با Backoff نمایی (§۱۲.۳ / E4).
 *
 * ── چرا فقط دور درخواست، نه دور کل جریان ──────────────────────
 * همهٔ سرویس‌های بیرونی این پروژه جریانی‌اند. وقتی اولین توکن یا
 * اولین بایت صدا به کاربر رسید، تلاش مجدد یعنی **تکرار همان محتوا**.
 * پس مرز امن تلاش مجدد دقیقاً همان‌جاست: تا وقتی بدنهٔ پاسخ خوانده
 * نشده. `fetchWithRetry` همین کار را می‌کند و به‌محض رسیدن پاسخِ
 * قابل‌قبول، کنترل را به فراخوان می‌دهد.
 *
 * ── چه چیزی هرگز تلاش مجدد نمی‌شود ────────────────────────────
 * ۱. لغو بیرونی (Barge-In §F8) — کاربر وسط حرف پریده، انتظار او
 *    این است که همه‌چیز فوراً بایستد، نه اینکه دوباره تلاش شود.
 * ۲. خطای دائمی مثل ۴۰۱ و ۴۰۳ و ۴۰۰ — کلید غلط با تکرار درست نمی‌شود.
 * ۳. درخواست‌هایی که عارضهٔ جانبی می‌سازند (ثبت سفارش، رزرو جلسه،
 *    ساخت Voice Clone). تصمیم Idempotent بودن با فراخوان است، نه اینجا.
 *
 * این ماژول عمداً `server-only` نیست: هیچ کلید یا رازی ندارد و
 * منطق زمان‌بندی‌اش باید در آزمون‌های خارج از Next قابل بررسی باشد.
 */

export type RetryPolicy = {
  /** تعداد کل تلاش‌ها، شامل تلاش اول. */
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  attempts: 3,
  baseDelayMs: 400,
  maxDelayMs: 4000,
};

/** برای درخواست‌هایی که تکرارشان عارضهٔ جانبی می‌سازد. */
export const NO_RETRY_POLICY: RetryPolicy = { attempts: 1, baseDelayMs: 0, maxDelayMs: 0 };

/**
 * وضعیت‌های HTTP که «گذرا» شمرده می‌شوند.
 *
 * ۴۰۹ و ۴۲۲ عمداً نیستند: آن‌ها یعنی درخواست از نظر منطقی مشکل
 * دارد و تکرارش همان نتیجه را می‌دهد.
 */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/** کدهای خطای شبکه در Node که با تلاش مجدد اغلب حل می‌شوند. */
const RETRYABLE_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'ENOTFOUND',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
]);

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status);
}

export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  // لغو بیرونی هرگز تلاش مجدد نمی‌شود.
  if (error.name === 'AbortError') return false;
  if (error.name === 'TimeoutError') return true;

  // `fetch` در Node خطای شبکه را به‌صورت TypeError با cause می‌دهد.
  const cause = (error as { cause?: unknown }).cause;
  const code =
    typeof cause === 'object' && cause !== null && 'code' in cause
      ? String((cause as { code: unknown }).code)
      : undefined;

  if (code && RETRYABLE_CODES.has(code)) return true;
  return error instanceof TypeError && /fetch failed|network|socket/i.test(error.message);
}

/**
 * تأخیر تلاش بعدی: نمایی با Jitter برابر.
 *
 * نیمی از تأخیر ثابت است و نیمی تصادفی. Jitter کامل (تصادفی از صفر)
 * گاهی تأخیر را تقریباً صفر می‌کند و همان سرویسِ زیر فشار را دوباره
 * می‌کوبد؛ Jitter برابر هم پخش می‌کند و هم کف تأخیر را حفظ می‌کند.
 */
export function backoffDelayMs(
  attempt: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  random: () => number = Math.random,
): number {
  const ceiling = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** attempt);
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

/** خواندن سرنخ `Retry-After` — هم قالب ثانیه و هم قالب تاریخ. */
export function retryAfterMs(response: Response, now: number = Date.now()): number | null {
  const header = response.headers.get('retry-after');
  if (!header) return null;

  const seconds = Number(header.trim());
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

/** انتظار قابل لغو — Barge-In نباید پشت یک تایمر گیر کند. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('لغو شد', 'AbortError'));
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    function onAbort(): void {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException('لغو شد', 'AbortError'));
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export type RetryInfo = { attempt: number; delayMs: number; reason: string };

export type RetryOptions = {
  policy?: RetryPolicy;
  signal?: AbortSignal;
  onRetry?: (info: RetryInfo) => void;
};

/**
 * `fetch` با تلاش مجدد روی خطاهای گذرا.
 *
 * پاسخ بازگشتی ممکن است همچنان ناموفق باشد؛ این تابع خطا را پنهان
 * نمی‌کند، فقط تلاش را تکرار می‌کند. تصمیم‌گیری دربارهٔ پاسخ نهایی
 * با فراخوان است.
 */
export async function fetchWithRetry(
  input: string | URL,
  init: RequestInit,
  options: RetryOptions = {},
): Promise<Response> {
  const policy = options.policy ?? DEFAULT_RETRY_POLICY;
  const { signal, onRetry } = options;

  let lastError: unknown;

  for (let attempt = 0; ; attempt += 1) {
    let response: Response | undefined;
    let reason: string;

    try {
      response = await fetch(input, init);
      if (!isRetryableStatus(response.status)) return response;
      reason = `HTTP ${response.status}`;
    } catch (error) {
      // لغو بیرونی: بی‌درنگ بیرون می‌رویم، حتی اگر خطا «گذرا» به نظر برسد.
      if (signal?.aborted || !isRetryableError(error)) throw error;
      lastError = error;
      reason = error instanceof Error ? error.message : String(error);
    }

    const isLastAttempt = attempt >= policy.attempts - 1;
    let delayMs = backoffDelayMs(attempt, policy);

    if (response) {
      const hinted = retryAfterMs(response);
      // اگر سرویس گفت خیلی دیرتر برگرد، انتظار بی‌فایده است: همان پاسخ
      // را برمی‌گردانیم تا لایهٔ بالاتر پیام صادقانه به کاربر بدهد.
      if (hinted !== null && hinted > policy.maxDelayMs) return response;
      if (hinted !== null) delayMs = hinted;
    }

    if (isLastAttempt) {
      if (response) return response;
      throw lastError;
    }

    // آزاد کردن سوکت پیش از انتظار، وگرنه اتصال تا پایان Backoff باز می‌ماند.
    await response?.body?.cancel().catch(() => {});

    onRetry?.({ attempt: attempt + 1, delayMs, reason });
    await sleep(delayMs, signal);
  }
}

/** گزارش تلاش مجدد در کنسول سرور — تلاشی که موفق شود «خطا» نیست. */
export function logRetry(service: string): (info: RetryInfo) => void {
  return (info) => {
    console.warn(
      `[${service}] تلاش مجدد ${info.attempt} پس از ${info.delayMs} میلی‌ثانیه — ${info.reason}`,
    );
  };
}
