import 'server-only';
import type { TTSOptions, TTSProvider } from '@/lib/ai/types';
import { ProviderRequestError } from '@/lib/ai/types';
import { describeHttpError } from '@/lib/ai/stream-utils';
import { fetchWithRetry, logRetry } from '@/lib/http/retry';
import { toPersianDigits } from '@/lib/text/persian';

const BASE = 'https://api.elevenlabs.io/v1';

/**
 * TTS ابری با پشتیبانی از Voice Clone.
 *
 * الزامات کلیدی که اینجا رعایت شده‌اند:
 *  - F6.1: خروجی جریانی؛ هرگز منتظر تولید کامل فایل نمی‌مانیم.
 *  - F6.5: لغو فوری با AbortSignal (برای Barge-In).
 *  - F2.5: Clone فقط یک‌بار انجام می‌شود — این کلاس هیچ‌جا در مسیر
 *    پاسخ‌دهی `cloneVoice` را صدا نمی‌زند؛ فقط مسیر مدیریتی آپلود.
 */
export class ElevenLabsProvider implements TTSProvider {
  readonly name = 'elevenlabs';
  readonly supportsCloning = true;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly defaultVoiceId: string,
  ) {}

  async *synthesizeStream(text: string, options: TTSOptions = {}): AsyncIterable<Uint8Array> {
    const voiceId = options.voiceId || this.defaultVoiceId;
    if (!voiceId) {
      throw new ProviderRequestError('tts', 'شناسهٔ صدا مشخص نیست؛ ابتدا صدا را Clone کنید.');
    }

    // ارقام لاتین در متن فارسی گاهی انگلیسی خوانده می‌شوند (F6.6).
    const spoken = toPersianDigits(text);

    const format = options.format === 'pcm16' ? 'pcm_24000' : 'mp3_44100_128';

    // تلاش مجدد فقط تا پیش از رسیدن اولین بایت صدا امن است (E4).
    const response = await fetchWithRetry(
      `${BASE}/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=${format}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'xi-api-key': this.apiKey,
          accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: spoken,
          model_id: this.model,
          voice_settings: { stability: 0.45, similarity_boost: 0.8, speed: options.speed ?? 1 },
        }),
        signal: options.signal,
      },
      { signal: options.signal, onRetry: logRetry('tts') },
    );

    if (!response.ok || !response.body) {
      throw new ProviderRequestError('tts', await describeHttpError(response), response.status);
    }

    const reader = response.body.getReader();
    try {
      while (true) {
        if (options.signal?.aborted) return;
        const { done, value } = await reader.read();
        if (done) break;
        if (value) yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }

  async cloneVoice(sample: {
    data: Uint8Array;
    fileName: string;
    mimeType: string;
    displayName: string;
  }): Promise<{ voiceId: string }> {
    const form = new FormData();
    form.append('name', sample.displayName);
    form.append(
      'files',
      new Blob([new Uint8Array(sample.data)], { type: sample.mimeType }),
      sample.fileName,
    );
    form.append('description', 'صدای آواتار — دستیار دیجیتال فارسی');

    const response = await fetch(`${BASE}/voices/add`, {
      method: 'POST',
      headers: { 'xi-api-key': this.apiKey },
      body: form,
    });

    if (!response.ok) {
      throw new ProviderRequestError('tts', await describeHttpError(response), response.status);
    }

    const body = (await response.json()) as { voice_id?: string };
    if (!body.voice_id) {
      throw new ProviderRequestError('tts', 'سرویس شناسهٔ صدا برنگرداند.');
    }

    return { voiceId: body.voice_id };
  }
}
