'use client';

import clsx from 'clsx';
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { MicIcon, MicOffIcon, SendIcon, StopIcon } from '@/components/ui/icons';
import type { ConversationState } from '@/lib/config/constants';

/**
 * ورودی کاربر — تایپی و صوتی (§F4، §F5).
 *
 * Barge-In با تایپ هم کار می‌کند (F8.5): ارسال پیام جدید حین
 * پاسخ‌دهی، پاسخ قبلی را لغو می‌کند. دکمهٔ توقف هم مسیر صریح
 * قطع کردن را می‌دهد.
 */

type ComposerProps = {
  state: ConversationState;
  micEnabled: boolean;
  micAvailable: boolean;
  onSend: (text: string) => void;
  onToggleMic: () => void;
  onInterrupt: () => void;
};

export function Composer({
  state,
  micEnabled,
  micAvailable,
  onSend,
  onToggleMic,
  onInterrupt,
}: ComposerProps) {
  const [value, setValue] = useState('');
  const busy = state === 'thinking' || state === 'speaking';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = value.trim();
    if (!text) return;
    setValue('');
    onSend(text);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter می‌فرستد، Shift+Enter خط جدید می‌سازد (F4.2).
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const text = value.trim();
      if (!text) return;
      setValue('');
      onSend(text);
    }
  };

  return (
    <form onSubmit={submit} className="flex items-end gap-2">
      <button
        type="button"
        onClick={onToggleMic}
        disabled={!micAvailable}
        aria-label={micEnabled ? 'خاموش کردن میکروفون' : 'روشن کردن میکروفون'}
        title={
          micAvailable
            ? micEnabled
              ? 'خاموش کردن میکروفون'
              : 'گفتگوی صوتی'
            : 'گفتگوی صوتی در این نصب فعال نیست'
        }
        className={clsx(
          'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors',
          micEnabled
            ? 'border-state-listening/50 bg-state-listening/15 text-state-listening'
            : 'border-line bg-surface-raised text-content-muted hover:border-line-strong hover:text-content',
          !micAvailable && 'cursor-not-allowed opacity-40',
        )}
      >
        {micEnabled ? <MicIcon /> : <MicOffIcon />}
        {micEnabled && (
          <span className="absolute inset-0 rounded-xl ring-2 ring-state-listening/40 animate-pulse-ring" />
        )}
      </button>

      <div className="relative flex-1">
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          dir="rtl"
          placeholder="سؤالتان را بنویسید…"
          aria-label="متن پیام"
          className="field max-h-32 min-h-[2.75rem] resize-none py-3 pe-12 leading-6"
        />

        <button
          type="submit"
          disabled={!value.trim()}
          aria-label="ارسال"
          className="absolute bottom-1.5 end-1.5 flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-ink transition-colors hover:bg-brand-soft disabled:opacity-30"
        >
          <SendIcon className="h-4 w-4" />
        </button>
      </div>

      {busy && (
        <button
          type="button"
          onClick={onInterrupt}
          aria-label="توقف پاسخ"
          title="توقف پاسخ"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-raised text-content-muted transition-colors hover:border-state-error/50 hover:text-state-error"
        >
          <StopIcon className="h-4 w-4" />
        </button>
      )}
    </form>
  );
}
