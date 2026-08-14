import 'server-only';

/**
 * ابزارهای مشترک خواندن پاسخ‌های جریانی.
 *
 * هر سرویس LLM قالب کمی متفاوتی دارد (SSE یا NDJSON) ولی همه روی
 * یک ReadableStream می‌آیند؛ این ماژول بخش تکراری را یک‌جا می‌کند.
 */

/** خطوط یک ReadableStream را یکی‌یکی برمی‌گرداند (بدون کاراکتر پایان خط). */
export async function* readLines(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const onAbort = () => void reader.cancel().catch(() => {});
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    while (true) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
        buffer = buffer.slice(newlineIndex + 1);
        yield line;
        newlineIndex = buffer.indexOf('\n');
      }
    }

    const tail = buffer.trim();
    if (tail) yield tail;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
}

export type SseEvent = { event: string; data: string };

/** رویدادهای Server-Sent Events را از یک استریم بیرون می‌کشد. */
export async function* readSse(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent> {
  let eventName = 'message';
  let dataLines: string[] = [];

  for await (const line of readLines(stream, signal)) {
    if (line === '') {
      if (dataLines.length > 0) {
        yield { event: eventName, data: dataLines.join('\n') };
      }
      eventName = 'message';
      dataLines = [];
      continue;
    }

    if (line.startsWith(':')) continue; // کامنت keep-alive

    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
  }

  if (dataLines.length > 0) {
    yield { event: eventName, data: dataLines.join('\n') };
  }
}

/** JSON.parse امن — قطعهٔ ناقص یا نامعتبر باعث سقوط جریان نمی‌شود. */
export function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** بدنهٔ خطای یک پاسخ HTTP را برای پیام خطای خوانا استخراج می‌کند. */
export async function describeHttpError(response: Response): Promise<string> {
  let detail = '';
  try {
    const text = await response.text();
    detail = text.slice(0, 500);
  } catch {
    detail = '';
  }
  return `HTTP ${response.status}${detail ? ` — ${detail}` : ''}`;
}

/**
 * تشخیص اینکه یک خطا از سر رسیدن مهلت است یا لغو بیرونی.
 *
 * فرق این دو مهم است: مهلت یعنی سرویس بیرونی کند بود (پیام و وضعیت
 * جداگانه دارد — F9.5)، ولی لغو یعنی خودِ کاربر وسط حرف پرید (§F8)
 * و اصلاً نباید مثل خطا گزارش شود.
 */
export function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError';
}

/**
 * ترکیب AbortSignal بیرونی با Timeout.
 * برمی‌گرداند: سیگنال ترکیبی و تابع پاک‌سازی تایمر.
 *
 * دلیل استفاده از DOMException با نام TimeoutError: `fetch` هنگام
 * لغو، دقیقاً همان `reason` سیگنال را پرتاب می‌کند. اگر اینجا یک
 * Error معمولی بدهیم، در سمت گیرنده از هر خطای دیگری قابل تشخیص
 * نیست. این همان قراردادی است که خودِ `AbortSignal.timeout()` دارد.
 */
export function withTimeout(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException(`مهلت ${timeoutMs} میلی‌ثانیه‌ای تمام شد`, 'TimeoutError')),
    timeoutMs,
  );

  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}
