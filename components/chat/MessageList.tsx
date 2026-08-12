'use client';

import clsx from 'clsx';
import { useEffect, useRef } from 'react';
import type { ChatMessageView } from '@/lib/client/store';
import { ChatIcon, ShieldIcon } from '@/components/ui/icons';

/** تاریخچهٔ مکالمهٔ جاری (F4.6). */
export function MessageList({
  messages,
  partialTranscript,
}: {
  messages: ChatMessageView[];
  partialTranscript: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, partialTranscript]);

  if (messages.length === 0 && !partialTranscript) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col gap-3">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}

      {partialTranscript && (
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-2xl rounded-ss-md border border-dashed border-brand/40 bg-brand-wash px-4 py-2.5 text-sm text-content-muted">
            {partialTranscript}
            <span className="ms-1 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-brand" />
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessageView }) {
  const isUser = message.role === 'user';

  if (!isUser && message.pending && !message.content && !message.refused) {
    return <ThinkingBubble />;
  }

  return (
    <div className={clsx('flex animate-fade-up', isUser ? 'justify-start' : 'justify-end')}>
      <div
        className={clsx(
          'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-7',
          isUser
            ? 'rounded-ss-md bg-surface-raised text-content'
            : message.refused
              ? 'rounded-se-md border border-line bg-surface text-content-muted'
              : 'rounded-se-md bg-brand-wash text-content ring-1 ring-brand/25',
        )}
      >
        {message.refused && (
          <span className="mb-1.5 flex items-center gap-1.5 text-[11px] text-content-faint">
            <ShieldIcon className="h-3.5 w-3.5" />
            خارج از حوزهٔ پاسخ‌گویی
          </span>
        )}

        <p className="whitespace-pre-wrap">{message.content}</p>

        {message.sources && message.sources.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5 border-t border-line/60 pt-2">
            {message.sources.map((source, index) => (
              <li
                key={`${source.title}-${source.page}-${index}`}
                className="rounded-md bg-surface-sunken px-2 py-0.5 text-[11px] text-content-faint"
              >
                {source.title}
                {source.page ? ` — ص ${source.page}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex justify-end">
      <div className="flex items-center gap-1.5 rounded-2xl rounded-se-md bg-brand-wash px-4 py-3 ring-1 ring-brand/25">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand"
            style={{ animationDelay: `${index * 160}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <ChatIcon className="h-9 w-9 text-content-faint/60" />
      <p className="max-w-[15rem] text-xs leading-relaxed text-content-faint">
        سؤالتان را بپرسید — می‌توانید تایپ کنید یا میکروفون را روشن کنید.
      </p>
    </div>
  );
}
