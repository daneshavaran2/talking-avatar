'use client';

import { UserRoundIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';
import type { AudioQueue } from '@/lib/client/audio-queue';
import { LipSyncController } from '@/lib/client/lipsync/controller';
import type { RuntimeConfig } from '@/lib/client/store';
import type { ConversationState } from '@/lib/config/constants';
import { DEFAULT_FACE_GEOMETRY, parseFaceGeometry } from '@/lib/lipsync/geometry';

/**
 * صحنهٔ آواتار با لیپ‌سینک بلادرنگ (§F7).
 *
 * آواتار روی Canvas رندر می‌شود و دهانش با همان صدایی که پخش
 * می‌شود هماهنگ حرکت می‌کند. مرجع زمان، ساعت AudioContext است
 * (جزئیات در lib/client/lipsync/controller.ts).
 *
 * حالت Idle هرگز متوقف نمی‌شود — پلک، تنفس و حرکت جزئی سر همیشه
 * در جریان‌اند، پس انتقال به حالت صحبت بی‌درز است (F7.2).
 *
 * اگر موتور آواتار GPU (media-engine) پیکربندی شده باشد، ویدئوی
 * زندهٔ آن جای این لایه را می‌گیرد.
 */

type AvatarStageProps = {
  state: ConversationState;
  config: RuntimeConfig | null;
  audio: AudioQueue | null;
};

const RING_BY_STATE: Record<ConversationState, string> = {
  idle: 'ring-border',
  listening: 'ring-state-listening/60',
  thinking: 'ring-state-thinking/60',
  speaking: 'ring-state-speaking/55',
  interrupted: 'ring-border',
  error: 'ring-state-error/60',
};

export function AvatarStage({ state, config, audio }: AvatarStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<LipSyncController | null>(null);

  const imageUrl = config?.avatar.imageUrl ?? null;
  const idleLoopUrl = config?.avatar.idleLoopUrl ?? null;
  const realtimeEngine = config?.avatar.realtime ?? false;
  const geometryRaw = config?.avatar.geometry ?? null;

  // ── راه‌اندازی موتور لیپ‌سینک ────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audio || !imageUrl || idleLoopUrl) return;

    const controller = new LipSyncController(canvas, audio);
    controllerRef.current = controller;
    controller.setGeometry(parseFaceGeometry(geometryRaw) ?? DEFAULT_FACE_GEOMETRY);

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      controller.setImage(image);
      controller.start();
    };
    image.src = imageUrl;

    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [audio, imageUrl, idleLoopUrl, geometryRaw]);

  // زمان‌بندی هر جمله از صف صدا به موتور لیپ‌سینک می‌رسد.
  useEffect(() => {
    if (!audio) return;

    audio.onSentenceScheduled = (sentence) => {
      controllerRef.current?.schedule(sentence);
    };
    audio.onCleared = () => {
      controllerRef.current?.clear();
    };

    return () => {
      audio.onSentenceScheduled = undefined;
      audio.onCleared = undefined;
    };
  }, [audio]);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div
        className={cn(
          'relative aspect-[3/4] w-full max-w-80 overflow-hidden rounded-2xl bg-muted ring-1 transition-shadow duration-500',
          RING_BY_STATE[state],
          state === 'speaking' && 'shadow-[0_0_36px_-10px_hsl(var(--state-speaking)/0.55)]',
        )}
      >
        {idleLoopUrl ? (
          <video
            src={idleLoopUrl}
            className="size-full object-cover"
            muted
            loop
            playsInline
            autoPlay
            aria-label="آواتار"
          />
        ) : imageUrl ? (
          <canvas
            ref={canvasRef}
            className="size-full"
            aria-label="آواتار"
            role="img"
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <UserRoundIcon className="size-12 opacity-40" />
            <p className="px-8 text-center text-xs leading-relaxed">
              هنوز چهره‌ای برای آواتار تنظیم نشده است.
            </p>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background/80 to-transparent" />

        {state === 'listening' && (
          <div
            className="pointer-events-none absolute inset-0 animate-pulse-ring rounded-2xl ring-2 ring-state-listening/40"
            aria-hidden
          />
        )}
      </div>

      {imageUrl && !realtimeEngine && !idleLoopUrl && (
        <p className="max-w-80 text-center text-[11px] leading-relaxed text-muted-foreground">
          لیپ‌سینک بلادرنگ از روی صدا اجرا می‌شود. برای چهرهٔ تولیدی فوتورئال، سرویس
          media-engine را با یک مدل Lip Sync فعال کنید.
        </p>
      )}
    </div>
  );
}
