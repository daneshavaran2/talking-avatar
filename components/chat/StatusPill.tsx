'use client';

import { cn } from '@/lib/utils';
import { STATE_LABELS, type ConversationState } from '@/lib/config/constants';

/**
 * نشانگر وضعیت مکالمه.
 * رنگ و حرکت باید بدون خواندن متن هم قابل تشخیص باشند.
 */

const DOT_BY_STATE: Record<ConversationState, string> = {
  idle: 'bg-state-idle',
  listening: 'bg-state-listening',
  thinking: 'bg-state-thinking',
  speaking: 'bg-state-speaking',
  interrupted: 'bg-state-idle',
  reconnecting: 'bg-state-thinking',
  error: 'bg-state-error',
};

const TEXT_BY_STATE: Record<ConversationState, string> = {
  idle: 'text-muted-foreground',
  listening: 'text-state-listening',
  thinking: 'text-state-thinking',
  speaking: 'text-state-speaking',
  interrupted: 'text-muted-foreground',
  reconnecting: 'text-state-thinking',
  error: 'text-state-error',
};

export function StatusPill({ state }: { state: ConversationState }) {
  const animated =
    state === 'listening' ||
    state === 'thinking' ||
    state === 'speaking' ||
    state === 'reconnecting';

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1.5 text-xs font-medium backdrop-blur',
        TEXT_BY_STATE[state],
      )}
    >
      <span className="relative flex size-2">
        {animated && (
          <span
            className={cn(
              'absolute inline-flex size-full animate-pulse-ring rounded-full',
              DOT_BY_STATE[state],
            )}
          />
        )}
        <span className={cn('relative inline-flex size-2 rounded-full', DOT_BY_STATE[state])} />
      </span>
      {STATE_LABELS[state]}
    </div>
  );
}
