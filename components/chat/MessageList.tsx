'use client';

import { MessagesSquareIcon, ShieldIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { Badge } from '@/components/ui/badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { cn } from '@/lib/utils';
import type { ChatMessageView } from '@/lib/client/store';

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
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessagesSquareIcon />
          </EmptyMedia>
          <EmptyTitle>گفتگو را شروع کنید</EmptyTitle>
          <EmptyDescription>
            سؤالتان را تایپ کنید یا میکروفون را روشن کنید و بپرسید.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}

      {partialTranscript && (
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-2xl rounded-ss-md border border-dashed border-primary/40 bg-accent px-4 py-2.5 text-sm text-muted-foreground">
            {partialTranscript}
            <span className="ms-1 inline-block h-3.5 w-px translate-y-0.5 animate-pulse bg-primary" />
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
    <div className={cn('flex animate-fade-up', isUser ? 'justify-start' : 'justify-end')}>
      <div
        className={cn(
          'flex max-w-[85%] flex-col gap-2 rounded-2xl px-4 py-2.5 text-sm leading-7',
          isUser
            ? 'rounded-ss-md bg-secondary text-secondary-foreground'
            : message.refused
              ? 'rounded-se-md border bg-card text-muted-foreground'
              : 'rounded-se-md bg-accent text-accent-foreground',
        )}
      >
        {message.refused && (
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldIcon className="size-3.5" />
            خارج از حوزهٔ پاسخ‌گویی
          </span>
        )}

        <p className="whitespace-pre-wrap">{message.content}</p>

        {message.sources && message.sources.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t pt-2">
            {message.sources.map((source, index) => (
              <Badge key={`${source.title}-${source.page}-${index}`} variant="secondary">
                {source.title}
                {source.page ? ` — ص ${source.page}` : ''}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex justify-end">
      <div className="flex items-center gap-1.5 rounded-2xl rounded-se-md bg-accent px-4 py-3">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="size-1.5 animate-pulse rounded-full bg-primary"
            style={{ animationDelay: `${index * 160}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
