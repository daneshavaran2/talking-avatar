'use client';

import clsx from 'clsx';
import { STATE_LABELS, type ConversationState } from '@/lib/config/constants';

/**
 * نشانگر وضعیت مکالمه.
 * تنها جایی است که کاربر می‌فهمد سیستم در چه حالتی است — رنگ و
 * حرکت باید بدون خواندن متن هم قابل تشخیص باشند.
 */

const STYLES: Record<ConversationState, { dot: string; text: string; ring: string }> = {
  idle: { dot: 'bg-state-idle', text: 'text-content-muted', ring: 'ring-state-idle/25' },
  listening: { dot: 'bg-state-listening', text: 'text-state-listening', ring: 'ring-state-listening/30' },
  thinking: { dot: 'bg-state-thinking', text: 'text-state-thinking', ring: 'ring-state-thinking/30' },
  speaking: { dot: 'bg-state-speaking', text: 'text-state-speaking', ring: 'ring-state-speaking/30' },
  interrupted: { dot: 'bg-state-idle', text: 'text-content-muted', ring: 'ring-state-idle/25' },
  error: { dot: 'bg-state-error', text: 'text-state-error', ring: 'ring-state-error/30' },
};

export function StatusPill({ state }: { state: ConversationState }) {
  const style = STYLES[state];
  const animated = state === 'listening' || state === 'thinking' || state === 'speaking';

  return (
    <div
      className={clsx(
        'inline-flex items-center gap-2 rounded-full bg-surface/80 px-3.5 py-1.5 text-xs font-medium ring-1 backdrop-blur',
        style.ring,
        style.text,
      )}
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2">
        {animated && (
          <span className={clsx('absolute inline-flex h-full w-full rounded-full animate-pulse-ring', style.dot)} />
        )}
        <span className={clsx('relative inline-flex h-2 w-2 rounded-full', style.dot)} />
      </span>
      {STATE_LABELS[state]}
    </div>
  );
}
