import 'server-only';
import type { STTProvider, STTResult, TTSOptions, TTSProvider } from '@/lib/ai/types';
import { ProviderRequestError } from '@/lib/ai/types';
import { describeHttpError, readLines, safeJsonParse } from '@/lib/ai/stream-utils';

/**
 * کلاینت سرویس GPU محلی (`services/media-engine`).
 *
 * این سرویس تنها جایی است که به CUDA نیاز دارد (§۵.۲): Whisper برای
 * STT، TTS محلی، و رندر آواتار. قرارداد HTTP آن در
 * `services/media-engine/README.md` مستند شده است.
 */

function authHeaders(token: string): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

export class MediaEngineTtsProvider implements TTSProvider {
  readonly name = 'media-engine';
  readonly supportsCloning = true;

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  async *synthesizeStream(text: string, options: TTSOptions = {}): AsyncIterable<Uint8Array> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/tts/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders(this.token) },
      body: JSON.stringify({
        text,
        voice_id: options.voiceId ?? null,
        format: options.format ?? 'mp3',
        speed: options.speed ?? 1,
      }),
      signal: options.signal,
    });

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
      'audio',
      new Blob([new Uint8Array(sample.data)], { type: sample.mimeType }),
      sample.fileName,
    );

    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/voice/clone`, {
      method: 'POST',
      headers: authHeaders(this.token),
      body: form,
    });

    if (!response.ok) {
      throw new ProviderRequestError('tts', await describeHttpError(response), response.status);
    }

    const body = (await response.json()) as { voice_id?: string };
    if (!body.voice_id) throw new ProviderRequestError('tts', 'سرویس شناسهٔ صدا برنگرداند.');

    return { voiceId: body.voice_id };
  }
}

/**
 * STT جریانی روی سرویس GPU.
 *
 * صدا به‌صورت Chunk ارسال می‌شود و **هرگز به فایل کامل تبدیل
 * نمی‌شود** (F5.2). خروجی NDJSON است تا متن جزئی زنده برسد (F5.3).
 */
export class MediaEngineSttProvider implements STTProvider {
  readonly name = 'media-engine';

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly model: string,
  ) {}

  async *transcribeStream(
    audio: AsyncIterable<Uint8Array>,
    signal?: AbortSignal,
  ): AsyncIterable<STTResult> {
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        for await (const chunk of audio) {
          if (signal?.aborted) break;
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });

    const response = await fetch(
      `${this.baseUrl.replace(/\/$/, '')}/stt/stream?model=${encodeURIComponent(this.model)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream', ...authHeaders(this.token) },
        body,
        // ارسال جریانی بدنه؛ بدون این، fetch منتظر کامل شدن بدنه می‌ماند.
        duplex: 'half',
        signal,
      } as RequestInit & { duplex: 'half' },
    );

    if (!response.ok || !response.body) {
      throw new ProviderRequestError('stt', await describeHttpError(response), response.status);
    }

    for await (const line of readLines(response.body, signal)) {
      if (!line.trim()) continue;
      const parsed = safeJsonParse<{ text?: string; is_final?: boolean; confidence?: number }>(line);
      if (!parsed?.text) continue;

      yield {
        text: parsed.text,
        isFinal: Boolean(parsed.is_final),
        confidence: parsed.confidence,
      };
    }
  }
}
