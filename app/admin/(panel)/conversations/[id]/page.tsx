import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  CATEGORY_LABELS,
  TOPIC_LABELS,
  type BlockedCategory,
  type Topic,
} from '@/lib/config/constants';
import { prisma } from '@/lib/db/client';
import { TOOL_LABEL_BY_NAME } from '@/lib/tools/labels';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** نمای کامل یک مکالمه (§۱۰.۳). */
export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      toolCalls: { orderBy: { createdAt: 'asc' } },
      turns: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!conversation) notFound();

  const interrupted = conversation.turns.filter((turn) => turn.status === 'interrupted').length;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ms-3">
            <Link href="/admin/conversations">
              <ArrowRightIcon />
              بازگشت به آرشیو
            </Link>
          </Button>
          <h1 className="mt-2 text-lg font-semibold">جزئیات مکالمه</h1>
          <p className="mt-1 text-xs text-muted-foreground latn">
            {new Date(conversation.startedAt).toLocaleString('fa-IR')} · {conversation.id}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {conversation.topic && (
            <Badge variant="secondary">
              {TOPIC_LABELS[conversation.topic as Topic] ?? conversation.topic}
            </Badge>
          )}
          <Badge variant="outline">
            {conversation.inputMode === 'voice'
              ? 'صوتی'
              : conversation.inputMode === 'mixed'
                ? 'ترکیبی'
                : 'تایپی'}
          </Badge>
          {interrupted > 0 && (
            <Badge variant="warning">
              <span className="latn">{interrupted}</span> بار قطع شد
            </Badge>
          )}
        </div>
      </header>

      {conversation.summary && (
        <Card>
          <CardContent className="p-4">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">خلاصهٔ گفتگو</p>
            <p className="text-sm leading-7">{conversation.summary}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          {conversation.messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex',
                message.role === 'user'
                  ? 'justify-start'
                  : message.role === 'assistant'
                    ? 'justify-end'
                    : 'justify-center',
              )}
            >
              <div
                className={cn(
                  'max-w-[80%] rounded-2xl px-4 py-2.5',
                  message.role === 'user'
                    ? 'rounded-ss-md bg-secondary'
                    : 'rounded-se-md bg-accent',
                )}
              >
                <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span>{message.role === 'user' ? 'کاربر' : 'آواتار'}</span>
                  <span className="latn">
                    {new Date(message.createdAt).toLocaleTimeString('fa-IR')}
                  </span>
                  {message.inputType === 'voice' && <span>· صوتی</span>}
                  {message.latencyMs !== null && (
                    <span className="latn">· {message.latencyMs} ms</span>
                  )}
                  {message.ragUsed && <span>· از پایگاه دانش</span>}
                  {message.injectionFlag && (
                    <Badge variant="destructive">تلاش برای دور زدن محدودیت</Badge>
                  )}
                  {message.wasRefused && (
                    <Badge variant="warning">
                      امتناع
                      {message.refusalReason
                        ? ` — ${CATEGORY_LABELS[message.refusalReason as BlockedCategory] ?? message.refusalReason}`
                        : ''}
                      {message.refusalLayer ? ` (لایه ${message.refusalLayer})` : ''}
                    </Badge>
                  )}
                </div>

                <p className="whitespace-pre-wrap text-sm leading-7">{message.content}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {conversation.toolCalls.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="mb-3 text-xs font-medium text-muted-foreground">
              فراخوانی ابزارهای خارجی
            </p>
            <ul className="flex flex-col gap-1.5">
              {conversation.toolCalls.map((call) => (
                <li
                  key={call.id}
                  className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs"
                >
                  <span>{TOOL_LABEL_BY_NAME[call.name] ?? call.name}</span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    {call.latencyMs !== null && <span className="latn">{call.latencyMs} ms</span>}
                    <Badge variant={call.status === 'success' ? 'success' : 'destructive'}>
                      {call.status === 'success'
                        ? 'موفق'
                        : call.status === 'timeout'
                          ? 'بدون پاسخ'
                          : 'خطا'}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
