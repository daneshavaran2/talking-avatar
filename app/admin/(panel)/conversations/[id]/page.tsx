import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import {
  CATEGORY_LABELS,
  TOPIC_LABELS,
  type BlockedCategory,
  type Topic,
} from '@/lib/config/constants';
import { TOOL_LABEL_BY_NAME } from '@/lib/tools/labels';

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
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/conversations" className="text-xs text-brand-soft hover:underline">
            ← بازگشت به آرشیو
          </Link>
          <h1 className="mt-2 text-lg font-semibold text-content">جزئیات مکالمه</h1>
          <p className="mt-1 hint latn">
            {new Date(conversation.startedAt).toLocaleString('fa-IR')} · {conversation.id}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px]">
          {conversation.topic && (
            <span className="rounded-lg bg-surface-raised px-2 py-1 text-content-muted">
              {TOPIC_LABELS[conversation.topic as Topic] ?? conversation.topic}
            </span>
          )}
          <span className="rounded-lg bg-surface-raised px-2 py-1 text-content-muted">
            {conversation.inputMode === 'voice'
              ? 'صوتی'
              : conversation.inputMode === 'mixed'
                ? 'ترکیبی'
                : 'تایپی'}
          </span>
          {interrupted > 0 && (
            <span className="rounded-lg bg-state-thinking/15 px-2 py-1 text-state-thinking">
              <span className="latn">{interrupted}</span> بار قطع شد
            </span>
          )}
        </div>
      </header>

      {conversation.summary && (
        <div className="panel p-4">
          <p className="mb-1.5 text-xs font-medium text-content-muted">خلاصهٔ گفتگو</p>
          <p className="text-sm leading-7 text-content">{conversation.summary}</p>
        </div>
      )}

      <div className="panel space-y-3 p-4">
        {conversation.messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === 'user'
                ? 'flex justify-start'
                : message.role === 'assistant'
                  ? 'flex justify-end'
                  : 'flex justify-center'
            }
          >
            <div
              className={
                message.role === 'user'
                  ? 'max-w-[80%] rounded-2xl rounded-ss-md bg-surface-raised px-4 py-2.5'
                  : 'max-w-[80%] rounded-2xl rounded-se-md bg-brand-wash px-4 py-2.5 ring-1 ring-brand/20'
              }
            >
              <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px] text-content-faint">
                <span>{message.role === 'user' ? 'کاربر' : 'آواتار'}</span>
                <span className="latn">
                  {new Date(message.createdAt).toLocaleTimeString('fa-IR')}
                </span>
                {message.inputType === 'voice' && <span>· صوتی</span>}
                {message.latencyMs !== null && <span className="latn">· {message.latencyMs} ms</span>}
                {message.ragUsed && <span>· از پایگاه دانش</span>}
                {message.injectionFlag && (
                  <span className="rounded bg-state-error/15 px-1 py-0.5 text-state-error">
                    تلاش برای دور زدن محدودیت
                  </span>
                )}
                {message.wasRefused && (
                  <span className="rounded bg-state-thinking/15 px-1 py-0.5 text-state-thinking">
                    امتناع
                    {message.refusalReason
                      ? ` — ${CATEGORY_LABELS[message.refusalReason as BlockedCategory] ?? message.refusalReason}`
                      : ''}
                    {message.refusalLayer ? ` (لایه ${message.refusalLayer})` : ''}
                  </span>
                )}
              </div>

              <p className="whitespace-pre-wrap text-sm leading-7 text-content">
                {message.content}
              </p>
            </div>
          </div>
        ))}
      </div>

      {conversation.toolCalls.length > 0 && (
        <div className="panel p-4">
          <p className="mb-3 text-xs font-medium text-content-muted">فراخوانی ابزارهای خارجی</p>
          <ul className="space-y-1.5">
            {conversation.toolCalls.map((call) => (
              <li
                key={call.id}
                className="flex items-center justify-between rounded-lg bg-surface-sunken px-3 py-2 text-xs"
              >
                <span className="text-content">{TOOL_LABEL_BY_NAME[call.name] ?? call.name}</span>
                <span className="flex items-center gap-2 text-content-faint">
                  {call.latencyMs !== null && <span className="latn">{call.latencyMs} ms</span>}
                  <span
                    className={
                      call.status === 'success'
                        ? 'rounded bg-state-listening/15 px-1.5 py-0.5 text-state-listening'
                        : 'rounded bg-state-error/15 px-1.5 py-0.5 text-state-error'
                    }
                  >
                    {call.status === 'success'
                      ? 'موفق'
                      : call.status === 'timeout'
                        ? 'بدون پاسخ'
                        : 'خطا'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
