import 'server-only';
import type { STTProvider, TTSProvider } from '@/lib/ai/types';
import { ProviderNotConfiguredError } from '@/lib/ai/types';
import { env } from '@/lib/config/env';
import { prisma } from '@/lib/db/client';
import { ElevenLabsProvider } from '@/lib/speech/providers/elevenlabs';
import {
  MediaEngineSttProvider,
  MediaEngineTtsProvider,
} from '@/lib/speech/providers/media-engine';

/**
 * انتخاب سرویس گفتار از پیکربندی (§۵.۳).
 * تعویض سرویس فقط این فایل را تغییر می‌دهد.
 */

export function createTTSProvider(): TTSProvider {
  switch (env.ttsProvider) {
    case 'elevenlabs':
      if (!env.ttsApiKey) {
        throw new ProviderNotConfiguredError('tts', 'کلید API سرویس صدا تنظیم نشده (TTS_API_KEY).');
      }
      return new ElevenLabsProvider(env.ttsApiKey, env.ttsModel, env.ttsVoiceId);

    case 'media-engine':
      if (!env.mediaEngineUrl) {
        throw new ProviderNotConfiguredError('tts', 'آدرس سرویس رسانه تنظیم نشده (MEDIA_ENGINE_URL).');
      }
      return new MediaEngineTtsProvider(env.mediaEngineUrl, env.mediaEngineToken);

    default:
      throw new ProviderNotConfiguredError('tts', 'سرویس تبدیل متن به صدا پیکربندی نشده است.');
  }
}

export function createSTTProvider(): STTProvider {
  if (env.sttProvider === 'media-engine') {
    if (!env.mediaEngineUrl) {
      throw new ProviderNotConfiguredError('stt', 'آدرس سرویس رسانه تنظیم نشده (MEDIA_ENGINE_URL).');
    }
    return new MediaEngineSttProvider(env.mediaEngineUrl, env.mediaEngineToken, env.sttModel);
  }

  // حالت `browser` سمت سرور پیاده‌سازی ندارد: تشخیص گفتار کاملاً
  // در مرورگر انجام می‌شود و متن نهایی مستقیم به /api/chat می‌رود.
  throw new ProviderNotConfiguredError(
    'stt',
    env.sttProvider === 'browser'
      ? 'در این پیکربندی تشخیص گفتار در مرورگر انجام می‌شود، نه روی سرور.'
      : 'سرویس تبدیل صدا به متن پیکربندی نشده است.',
  );
}

/**
 * شناسهٔ صدای فعال.
 *
 * F2.5 (الزام عملکردی حیاتی): صدا هرگز به‌ازای هر درخواست دوباره
 * Clone نمی‌شود. شناسه یک‌بار هنگام آپلود ساخته و در پایگاه داده
 * ذخیره شده؛ اینجا فقط خوانده می‌شود.
 */
export async function activeVoiceId(): Promise<string | null> {
  const profile = await prisma.voiceProfile.findFirst({
    where: { isActive: true, status: 'ready' },
    select: { providerVoiceId: true },
    orderBy: { updatedAt: 'desc' },
  });

  return profile?.providerVoiceId ?? (env.ttsVoiceId || null);
}
