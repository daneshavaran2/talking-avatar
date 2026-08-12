import type { NextRequest } from 'next/server';
import { RATE_LIMITS } from '@/lib/config/constants';
import { ProviderNotConfiguredError } from '@/lib/ai/types';
import { activeVoiceId, createTTSProvider } from '@/lib/speech/factory';
import { logServiceError } from '@/lib/observability/log';
import { badRequest, notImplemented, serverError, tooManyRequests, validationError } from '@/lib/http/errors';
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

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of provider.synthesizeStream(parsed.data.text, {
          voiceId: voiceId ?? undefined,
          format: 'mp3',
          signal: request.signal,
        })) {
          if (request.signal.aborted) break;
          controller.enqueue(chunk);
        }
        controller.close();
      } catch (error) {
        if (!request.signal.aborted) {
          await logServiceError(
            'tts',
            'تولید صدا شکست خورد',
            error instanceof Error ? error.message : String(error),
            parsed.data.turnId,
          );
        }
        // بستن استریم بدون خطا: کلاینت به حالت «فقط متن» تنزل می‌کند (§۱۲.۲).
        try {
          controller.close();
        } catch {
          /* از قبل بسته شده */
        }
      }
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
