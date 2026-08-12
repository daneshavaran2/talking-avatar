'use client';

import clsx from 'clsx';
import { useEffect, useRef } from 'react';
import type { ConversationState } from '@/lib/config/constants';
import type { RuntimeConfig } from '@/lib/client/store';
import { FaceIcon } from '@/components/ui/icons';

/**
 * صحنهٔ آواتار.
 *
 * سه حالت ممکن، به‌ترتیب اولویت:
 *
 *  ۱. رندر بلادرنگ روی WebRTC — وقتی `AVATAR_PROVIDER=media-engine`
 *     پیکربندی شده باشد؛ ویدئوی زنده با Lip Sync (§F7).
 *  ۲. حلقهٔ Idle از پیش تولیدشده — ویدئوی ۸ ثانیه‌ای پلک و تنفس (F1.4).
 *  ۳. تصویر ثابت — تنزل تدریجی طبق §۱۲.۲ وقتی موتور آواتار در دسترس
 *     نیست. حرکت ملایمی که اینجا دیده می‌شود صرفاً CSS است و
 *     **Lip Sync نیست**؛ UI هم همین را صریح می‌گوید تا کسی آن را
 *     با آواتار زنده اشتباه نگیرد.
 */

type AvatarStageProps = {
  state: ConversationState;
  config: RuntimeConfig | null;
};

const RING_BY_STATE: Record<ConversationState, string> = {
  idle: 'ring-line',
  listening: 'ring-state-listening/60',
  thinking: 'ring-state-thinking/60',
  speaking: 'ring-state-speaking/60',
  interrupted: 'ring-line',
  error: 'ring-state-error/60',
};

export function AvatarStage({ state, config }: AvatarStageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const idleLoopUrl = config?.avatar.idleLoopUrl ?? null;
  const imageUrl = config?.avatar.imageUrl ?? null;
  const realtime = config?.avatar.realtime ?? false;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !idleLoopUrl) return;
    video.play().catch(() => {
      // پخش خودکار مسدود شده — تصویر اولین فریم می‌ماند، مشکلی نیست.
    });
  }, [idleLoopUrl]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className={clsx(
          'relative aspect-[3/4] w-full max-w-[22rem] overflow-hidden rounded-3xl bg-surface-sunken ring-1 transition-[box-shadow,--tw-ring-color] duration-500',
          RING_BY_STATE[state],
          state === 'speaking' && 'shadow-glow',
        )}
      >
        {idleLoopUrl ? (
          <video
            ref={videoRef}
            src={idleLoopUrl}
            className="h-full w-full object-cover"
            muted
            loop
            playsInline
            autoPlay
            aria-label="آواتار"
          />
        ) : imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="چهرهٔ آواتار"
            className={clsx(
              'h-full w-full object-cover',
              state === 'speaking' || state === 'thinking' ? 'animate-breathe' : 'animate-breathe',
            )}
          />
        ) : (
          <EmptyFace />
        )}

        {/* هالهٔ نرم پایین کادر تا زیرنویس روی تصویر خوانا بماند */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink/85 to-transparent" />

        {state === 'speaking' && <SpeakingBars />}
        {state === 'listening' && <ListeningHalo />}
      </div>

      {imageUrl && !realtime && (
        <p className="max-w-[22rem] text-center text-[11px] leading-relaxed text-content-faint">
          موتور آواتار بلادرنگ در این نصب فعال نیست؛ تصویر ثابت نمایش داده می‌شود و
          هماهنگی لب انجام نمی‌شود. صدا و متن کامل کار می‌کنند.
        </p>
      )}
    </div>
  );
}

function EmptyFace() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-content-faint">
      <FaceIcon className="h-14 w-14 opacity-50" />
      <p className="px-8 text-center text-xs leading-relaxed">
        هنوز چهره‌ای برای آواتار تنظیم نشده است.
      </p>
    </div>
  );
}

/** نوار صوتی تزئینی حین صحبت — بازخورد بصری، نه تحلیل واقعی صدا. */
function SpeakingBars() {
  return (
    <div className="absolute inset-x-0 bottom-4 flex items-end justify-center gap-1" aria-hidden>
      {[0, 1, 2, 3, 4].map((index) => (
        <span
          key={index}
          className="h-5 w-[3px] origin-bottom rounded-full bg-state-speaking/80 animate-wave"
          style={{ animationDelay: `${index * 110}ms` }}
        />
      ))}
    </div>
  );
}

function ListeningHalo() {
  return (
    <div
      className="pointer-events-none absolute inset-0 rounded-3xl ring-2 ring-state-listening/40 animate-pulse-ring"
      aria-hidden
    />
  );
}
