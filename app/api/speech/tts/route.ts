import type { NextRequest } from 'next/server';
import { RATE_LIMITS } from '@/lib/config/constants';
import { ProviderNotConfiguredError } from '@/lib/ai/types';
import { activeVoiceId, createTTSProvider } from '@/lib/speech/factory';
import { logServiceError } from '@/lib/observability/log';
import {
  badGateway,
  badRequest,
  notImplemented,
  serverError,
  tooManyRequests,
  validationError,
} from '@/lib/http/errors';
import { checkRateLimit, clientKey } from '@/lib/http/rate-limit';
import { ttsRequestSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/speech/tts` — متن → جریان صدا (§۹.۱).
 *
 * ورودی یک **جمله** است، نه کل پاسخ: کلاینت به‌ازای هر رویداد
 * `sentence` این مسیر را صدا می‌زند تا صدا زودتر شروع شود (F6.4).
 *
 * قطع اتصال کلاینت (Barge-In) با `request.signal` به Provider
 * منتقل می‌شود و تولید صدا فوراً متوقف می‌گردد (F6.5).
 */
export async function POST(request: NextRequest) {
  const limit = checkRateLimit(clientKey(request, 'tts'), RATE_LIMITS.speech);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('بدنهٔ درخواست JSON معتبر نیست.');
  }

  const parsed = ttsRequestSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  let provider;
  try {
    provider = createTTSProvider();
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) {
      return notImplemented('tts', 'سرویس تبدیل متن به صدا در این نصب پیکربندی نشده است.');
    }
    return serverError();
  }

  const voiceId = await activeVoiceId();

  const iterator = provider
    .synthesizeStream(parsed.data.text, {
      voiceId: voiceId ?? undefined,
      format: 'mp3',
      signal: request.signal,
    })
    [Symbol.asyncIterator]();

  /**
   * اولین قطعه پیش از ساختن پاسخ کشیده می‌شود.
   *
   * چرا: به‌محض برگرداندن `Response`، وضعیت ۲۰۰ رفته و دیگر نمی‌شود
   * خطا اعلام کرد. اگر سرویس صدا اصلاً بالا نیامده باشد، کلاینت یک
   * پاسخ ۲۰۰ با بدنهٔ خالی می‌گیرد و نمی‌فهمد چیزی خراب شده — پس هر
   * جملهٔ بعدی هم همان درخواست محکوم را تکرار می‌کند.
   *
   * این انتظار تأخیری اضافه نمی‌کند: کلاینت تا نرسیدن اولین بایت
   * صدا در هر حال چیزی برای پخش ندارد.
   */
  let first: IteratorResult<Uint8Array>;
  try {
    first = await iterator.next();
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    await logServiceError(
      'tts',
      'تولید صدا شکست خورد',
      error instanceof Error ? error.message : String(error),
      parsed.data.turnId,
    );
    return badGateway('سرویس صدا الان در دسترس نیست.');
  }

  if (first.done) {
    await logServiceError('tts', 'سرویس صدا هیچ داده‌ای تولید نکرد', undefined, parsed.data.turnId);
    return badGateway('سرویس صدا الان در دسترس نیست.');
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(first.value);

      try {
        for (;;) {
          if (request.signal.aborted) break;
          const next = await iterator.next();
          if (next.done) break;
          controller.enqueue(next.value);
        }
      } catch (error) {
        // خرابی وسط پخش: هدرها رفته‌اند، پس تنها کار ممکن بستن
        // استریم است. کلاینت بدنهٔ ناقص را می‌بیند و تنزل می‌کند.
        if (!request.signal.aborted) {
          await logServiceError(
            'tts',
            'جریان صدا وسط کار قطع شد',
            error instanceof Error ? error.message : String(error),
            parsed.data.turnId,
          );
        }
      }

      try {
        controller.close();
      } catch {
        /* از قبل بسته شده */
      }
    },

    // Barge-In: مولد باید بسته شود وگرنه اتصال به سرویس صدا باز می‌ماند.
    // خطای خود بستن نادیده گرفته می‌شود — اینجا دیگر کاری از دستمان
    // برنمی‌آید و یک Rejection بی‌صاحب فقط لاگ را کثیف می‌کند.
    cancel() {
      void Promise.resolve(iterator.return?.(undefined)).catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'audio/mpeg',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
    },
  });
}
