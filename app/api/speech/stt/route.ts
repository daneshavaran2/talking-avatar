import type { NextRequest } from 'next/server';
import { RATE_LIMITS } from '@/lib/config/constants';
import { ProviderNotConfiguredError } from '@/lib/ai/types';
import { createSTTProvider } from '@/lib/speech/factory';
import { logServiceError } from '@/lib/observability/log';
import { notImplemented, serverError, tooManyRequests } from '@/lib/http/errors';
import { checkRateLimit, clientKey } from '@/lib/http/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/speech/stt` — جریان صدا → متن (§۹.۱).
 *
 * بدنهٔ درخواست یک جریان دودویی از Chunkهای صداست؛ **هرگز به فایل
 * کامل تبدیل نمی‌شود** (F5.2). پاسخ NDJSON است تا متن جزئی زنده
 * برسد (F5.3):
 *
 *   {"text":"سلام من می‌خوا","is_final":false}
 *   {"text":"سلام من می‌خواستم بپرسم","is_final":true}
 *
 * وقتی `STT_PROVIDER=browser` باشد این مسیر ۵۰۱ برمی‌گرداند —
 * در آن پیکربندی تشخیص گفتار کاملاً در مرورگر انجام می‌شود.
 */
export async function POST(request: NextRequest) {
  const limit = checkRateLimit(clientKey(request, 'stt'), RATE_LIMITS.speech);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  let provider;
  try {
    provider = createSTTProvider();
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) {
      return notImplemented('stt', error.message);
    }
    return serverError();
  }

  if (!request.body) {
    return notImplemented('stt', 'بدنهٔ صوتی دریافت نشد.');
  }

  const source = request.body;

  async function* audioChunks(): AsyncGenerator<Uint8Array> {
    const reader = source.getReader();
    try {
      while (true) {
        if (request.signal.aborted) return;
        const { done, value } = await reader.read();
        if (done) return;
        if (value) yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const result of provider.transcribeStream(audioChunks(), request.signal)) {
          if (request.signal.aborted) break;
          controller.enqueue(
            encoder.encode(
              `${JSON.stringify({ text: result.text, is_final: result.isFinal, confidence: result.confidence })}\n`,
            ),
          );
        }
      } catch (error) {
        if (!request.signal.aborted) {
          await logServiceError(
            'stt',
            'تشخیص گفتار شکست خورد',
            error instanceof Error ? error.message : String(error),
          );
          controller.enqueue(
            encoder.encode(`${JSON.stringify({ error: 'تشخیص گفتار قطع شد.' })}\n`),
          );
        }
      } finally {
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
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
    },
  });
}
