'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Card, Spinner } from '@/components/admin/ui';
import { TOPIC_LABELS, TOPICS, type Topic } from '@/lib/config/constants';

/** آرشیو مکالمات با جستجو، فیلتر و خروجی CSV (§۱۰.۳). */

type ConversationRow = {
  id: string;
  topic: string | null;
  inputMode: string | null;
  messageCount: number;
  startedAt: string;
  endedAt: string | null;
  messages: Array<{
    role: string;
    content: string;
    wasRefused: boolean;
    latencyMs: number | null;
  }>;
};

const RANGE_DAYS = [
  { key: '1', label: 'امروز' },
  { key: '7', label: '۷ روز' },
  { key: '30', label: '۳۰ روز' },
  { key: '365', label: 'یک سال' },
];

export function ConversationArchive({ initialTopic }: { initialTopic?: string }) {
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [topic, setTopic] = useState(initialTopic ?? '');
  const [inputType, setInputType] = useState('');
  const [refusedOnly, setRefusedOnly] = useState(false);
  const [days, setDays] = useState('30');

  const buildQuery = useCallback(() => {
    const to = new Date();
    const from = new Date(to.getTime() - Number(days) * 24 * 60 * 60 * 1000);

    const params = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
      page: String(page),
      pageSize: '25',
    });

    if (search) params.set('search', search);
    if (topic) params.set('topic', topic);
    if (inputType) params.set('inputType', inputType);
    if (refusedOnly) params.set('refusedOnly', 'true');

    return params;
  }, [days, page, search, topic, inputType, refusedOnly]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/conversations?${buildQuery().toString()}`);
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'خواندن آرشیو ممکن نشد.');
        return;
      }

      const body = (await response.json()) as {
        rows: ConversationRow[];
        total: number;
        pageCount: number;
      };

      setRows(body.rows);
      setTotal(body.total);
      setPageCount(body.pageCount);
    } catch {
      setError('ارتباط با سرور برقرار نشد.');
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, topic, inputType, refusedOnly, days]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-content">آرشیو مکالمات</h1>
          <p className="mt-0.5 hint">
            <span className="latn">{total}</span> مکالمه در بازهٔ انتخابی
          </p>
        </div>

        <a
          href={`/api/admin/conversations/export?${buildQuery().toString()}`}
          className="btn-ghost text-xs"
          download
        >
          خروجی CSV
        </a>
      </header>

      <Card>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="md:col-span-2">
            <label htmlFor="search" className="label">
              جستجو در متن
            </label>
            <div className="flex gap-2">
              <input
                id="search"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') setSearch(searchDraft.trim());
                }}
                placeholder="بخشی از سؤال یا پاسخ…"
                className="field flex-1"
              />
              <button
                type="button"
                onClick={() => setSearch(searchDraft.trim())}
                className="btn-ghost shrink-0"
              >
                جستجو
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="topic" className="label">
              دسته
            </label>
            <select
              id="topic"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              className="field"
            >
              <option value="">همه</option>
              {TOPICS.map((item) => (
                <option key={item} value={item}>
                  {TOPIC_LABELS[item as Topic]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="range" className="label">
              بازهٔ زمانی
            </label>
            <select
              id="range"
              value={days}
              onChange={(event) => setDays(event.target.value)}
              className="field"
            >
              {RANGE_DAYS.map((range) => (
                <option key={range.key} value={range.key}>
                  {range.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-4 md:col-span-2 xl:col-span-4">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-content">
              <input
                type="checkbox"
                checked={inputType === 'voice'}
                onChange={(event) => setInputType(event.target.checked ? 'voice' : '')}
                className="h-4 w-4 accent-[#E3A857]"
              />
              فقط ورودی صوتی
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-xs text-content">
              <input
                type="checkbox"
                checked={refusedOnly}
                onChange={(event) => setRefusedOnly(event.target.checked)}
                className="h-4 w-4 accent-[#E3A857]"
              />
              فقط مکالمات دارای امتناع
            </label>
          </div>
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      {loading ? (
        <div className="flex justify-center py-16 text-content-faint">
          <Spinner className="h-6 w-6" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <p className="hint py-8 text-center">مکالمه‌ای با این فیلترها پیدا نشد.</p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const question = row.messages.find((message) => message.role === 'user');
            const answer = row.messages.find((message) => message.role === 'assistant');

            return (
              <li key={row.id}>
                <Link
                  href={`/admin/conversations/${row.id}`}
                  className="block panel p-4 transition-colors hover:border-line-strong"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-content-faint">
                    <span className="latn">
                      {new Date(row.startedAt).toLocaleString('fa-IR')}
                    </span>
                    {row.topic && (
                      <span className="rounded bg-surface-raised px-1.5 py-0.5">
                        {TOPIC_LABELS[row.topic as Topic] ?? row.topic}
                      </span>
                    )}
                    <span className="rounded bg-surface-raised px-1.5 py-0.5">
                      {row.inputMode === 'voice'
                        ? 'صوتی'
                        : row.inputMode === 'mixed'
                          ? 'ترکیبی'
                          : 'تایپی'}
                    </span>
                    <span className="latn">{row.messageCount} پیام</span>
                    {answer?.latencyMs && (
                      <span className="latn">{answer.latencyMs} ms</span>
                    )}
                    {answer?.wasRefused && (
                      <span className="rounded bg-state-thinking/15 px-1.5 py-0.5 text-state-thinking">
                        امتناع
                      </span>
                    )}
                  </div>

                  {question && (
                    <p className="line-clamp-1 text-sm text-content">{question.content}</p>
                  )}
                  {answer && (
                    <p className="mt-1 line-clamp-2 text-xs leading-6 text-content-muted">
                      {answer.content}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1}
            className="btn-ghost text-xs"
          >
            قبلی
          </button>
          <span className="text-xs text-content-muted latn">
            {page} / {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            disabled={page === pageCount}
            className="btn-ghost text-xs"
          >
            بعدی
          </button>
        </div>
      )}
    </div>
  );
}
