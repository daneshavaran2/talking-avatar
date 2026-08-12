import 'server-only';
import type { AvatarFrame, AvatarProvider, FacePreparation } from '@/lib/ai/types';
import { ProviderRequestError } from '@/lib/ai/types';
import { env } from '@/lib/config/env';
import { prisma } from '@/lib/db/client';
import { describeHttpError, readLines, safeJsonParse } from '@/lib/ai/stream-utils';

/**
 * لایهٔ آواتار (§F7).
 *
 * الگوی صحیح: `قطعهٔ صدا → فریم آواتار → جریان ویدئو → WebRTC → مرورگر`
 * الگوی ممنوع (F7.5): تولید فایل MP4 کامل → انتظار → پخش.
 *
 * پیاده‌سازی `MediaEngineAvatarProvider` قرارداد جریانی را رعایت
 * می‌کند. اگر سرویس GPU پیکربندی نشده باشد، `UnavailableAvatarProvider`
 * صادقانه اعلام می‌کند در دسترس نیست تا UI به تصویر ثابت تنزل کند
 * (§۱۲.۲) — نه اینکه وانمود کند آواتار زنده است.
 */

export class MediaEngineAvatarProvider implements AvatarProvider {
  readonly name = 'media-engine';
  readonly available = true;

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private headers(): Record<string, string> {
    return this.token ? { authorization: `Bearer ${this.token}` } : {};
  }

  async *renderStream(
    audio: AsyncIterable<Uint8Array>,
    signal?: AbortSignal,
  ): AsyncIterable<AvatarFrame> {
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        for await (const chunk of audio) {
          if (signal?.aborted) break;
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });

    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/avatar/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', ...this.headers() },
      body,
      duplex: 'half',
      signal,
    } as RequestInit & { duplex: 'half' });

    if (!response.ok || !response.body) {
      throw new ProviderRequestError('avatar', await describeHttpError(response), response.status);
    }

    // هر خط یک فریم به‌صورت JSON با دادهٔ base64 است.
    for await (const line of readLines(response.body, signal)) {
      if (!line.trim()) continue;
      const parsed = safeJsonParse<{
        data?: string;
        encoding?: 'jpeg' | 'webp' | 'h264';
        index?: number;
        timestamp_ms?: number;
      }>(line);

      if (!parsed?.data) continue;

      yield {
        data: Uint8Array.from(Buffer.from(parsed.data, 'base64')),
        encoding: parsed.encoding ?? 'jpeg',
        index: parsed.index ?? 0,
        timestampMs: parsed.timestamp_ms ?? 0,
      };
    }
  }

  async getIdleLoopUrl(): Promise<string | null> {
    const profile = await prisma.avatarProfile.findFirst({
      where: { isActive: true, status: 'ready' },
      select: { idleLoopUrl: true },
      orderBy: { updatedAt: 'desc' },
    });
    return profile?.idleLoopUrl ?? null;
  }

  /**
   * پیش‌پردازش عکس (F1.3، F1.4): تشخیص چهره، برش، نقاط کلیدی،
   * بردار ویژگی و ساخت حلقهٔ Idle. یک‌بار انجام می‌شود و نتیجه
   * Cache می‌شود (F1.5).
   */
  async prepareFace(image: {
    data: Uint8Array;
    fileName: string;
    mimeType: string;
  }): Promise<FacePreparation> {
    const form = new FormData();
    form.append(
      'image',
      new Blob([new Uint8Array(image.data)], { type: image.mimeType }),
      image.fileName,
    );

    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/avatar/prepare`, {
      method: 'POST',
      headers: this.headers(),
      body: form,
    });

    if (!response.ok) {
      throw new ProviderRequestError('avatar', await describeHttpError(response), response.status);
    }

    const body = (await response.json()) as {
      face_count?: number;
      landmarks?: unknown;
      embedding?: unknown;
      idle_loop_url?: string;
      width?: number;
      height?: number;
    };

    return {
      faceCount: body.face_count ?? 0,
      landmarks: body.landmarks,
      embedding: body.embedding,
      idleLoopUrl: body.idle_loop_url,
      width: body.width,
      height: body.height,
    };
  }
}

/** وقتی سرویس GPU پیکربندی نشده است. هیچ چیزی را جعل نمی‌کند. */
export class UnavailableAvatarProvider implements AvatarProvider {
  readonly name = 'none';
  readonly available = false;

  async *renderStream(): AsyncIterable<AvatarFrame> {
    throw new ProviderRequestError(
      'avatar',
      'موتور آواتار پیکربندی نشده است؛ رندر بلادرنگ در دسترس نیست.',
    );
  }

  async getIdleLoopUrl(): Promise<string | null> {
    return null;
  }
}

export function createAvatarProvider(): AvatarProvider {
  if (env.avatarProvider === 'media-engine' && env.mediaEngineUrl) {
    return new MediaEngineAvatarProvider(env.mediaEngineUrl, env.mediaEngineToken);
  }
  return new UnavailableAvatarProvider();
}
