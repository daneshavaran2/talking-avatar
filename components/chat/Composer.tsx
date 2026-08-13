'use client';

import { MicIcon, MicOffIcon, SendIcon, SquareIcon } from 'lucide-react';
import { useState, type FormEvent, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { ConversationState } from '@/lib/config/constants';

/**
 * ورودی کاربر — تایپی و صوتی (§F4، §F5).
 *
 * Barge-In با تایپ هم کار می‌کند (F8.5): ارسال پیام جدید حین
 * پاسخ‌دهی، پاسخ قبلی را لغو می‌کند.
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

  const send = () => {
    const text = value.trim();
    if (!text) return;
    setValue('');
    onSend(text);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    send();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter می‌فرستد، Shift+Enter خط جدید می‌سازد (F4.2).
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  return (
    <form onSubmit={submit} className="flex items-end gap-2">
      <Button
        type="button"
        variant={micEnabled ? 'default' : 'outline'}
        size="icon"
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
        className={cn('relative shrink-0', micEnabled && 'bg-state-listening hover:bg-state-listening/90')}
      >
        {micEnabled ? <MicIcon /> : <MicOffIcon />}
        {micEnabled && (
          <span className="absolute inset-0 animate-pulse-ring rounded-md ring-2 ring-state-listening/40" />
        )}
      </Button>

      <div className="relative flex-1">
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          dir="rtl"
          placeholder="سؤالتان را بنویسید…"
          aria-label="متن پیام"
          className="max-h-32 min-h-9 resize-none py-2 pe-11 leading-6"
        />

        <Button
          type="submit"
          size="icon"
          disabled={!value.trim()}
          aria-label="ارسال"
          className="absolute bottom-1 end-1 size-7"
        >
          <SendIcon />
        </Button>
      </div>

      {busy && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onInterrupt}
          aria-label="توقف پاسخ"
          title="توقف پاسخ"
          className="shrink-0"
        >
          <SquareIcon />
        </Button>
      )}
    </form>
  );
}
