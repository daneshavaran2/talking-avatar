import type { NextRequest } from 'next/server';
import { requireAdminApi } from '@/lib/auth/guard';
import { ProviderNotConfiguredError } from '@/lib/ai/types';
import { activeVoiceId, createTTSProvider } from '@/lib/speech/factory';
import { badRequest, notImplemented, serverError, validationError } from '@/lib/http/errors';
import { logServiceError } from '@/lib/observability/log';
import { voiceTestSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/admin/voice/test` — پخش جملهٔ تستی با صدای Clone‌شده (F2.6).
 * مدیر باید پیش از تأیید نهایی، صدا را بشنود.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('بدنهٔ درخواست JSON معتبر نیست.');
  }

  const parsed = voiceTestSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  let provider;
  try {
    provider = createTTSProvider();
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) {
      return notImplemented('tts', 'سرویس صدا پیکربندی نشده است.');
    }
    return serverError();
  }

  const voiceId = await activeVoiceId();
  if (!voiceId) {
    return badRequest('هنوز صدای اختصاصی ساخته نشده است. ابتدا نمونهٔ صدا را آپلود کنید.');
  }

  const chunks: Uint8Array[] = [];
  try {
    for await (const chunk of provider.synthesizeStream(parsed.data.text, {
      voiceId,
      format: 'mp3',
      signal: request.signal,
    })) {
      chunks.push(chunk);
    }
  } catch (error) {
    await logServiceError(
      'tts',
      'تست صدا شکست خورد',
      error instanceof Error ? error.message : String(error),
    );
    return serverError('تولید صدای تستی ممکن نشد.');
  }

  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const audio = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    audio.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new Response(audio, {
    headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' },
  });
}
