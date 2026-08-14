'use client';

import { DownloadIcon, SearchIcon } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { SectionCard } from '@/components/admin/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { TOPIC_LABELS, TOPICS, type Topic } from '@/lib/config/constants';

/** آرشیو مکالمات با جستجو، فیلتر و خروجی CSV (§۱۰.۳). */

type ConversationRow = {
  id: string;
  topic: string | null;
  inputMode: string | null;
  messageCount: number;
  startedAt: string;
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

  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [topic, setTopic] = useState(initialTopic ?? 'all');
  const [voiceOnly, setVoiceOnly] = useState(false);
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
    if (topic !== 'all') params.set('topic', topic);
    if (voiceOnly) params.set('inputType', 'voice');
    if (refusedOnly) params.set('refusedOnly', 'true');

    return params;
  }, [days, page, search, topic, voiceOnly, refusedOnly]);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch(`/api/admin/conversations?${buildQuery().toString()}`);
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? 'خواندن آرشیو ممکن نشد.');
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
      toast.error('ارتباط با سرور برقرار نشد.');
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, topic, voiceOnly, refusedOnly, days]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">آرشیو مکالمات</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <span className="latn">{total}</span> مکالمه در بازهٔ انتخابی
          </p>
        </div>

        <Button variant="outline" size="sm" asChild>
          <a href={`/api/admin/conversations/export?${buildQuery().toString()}`} download>
            <DownloadIcon />
            خروجی CSV
          </a>
        </Button>
      </header>

      <SectionCard>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="search">جستجو در متن</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="search"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') setSearch(searchDraft.trim());
                }}
                placeholder="بخشی از سؤال یا پاسخ…"
                className="flex-1"
              />
              <Button variant="outline" onClick={() => setSearch(searchDraft.trim())}>
                <SearchIcon />
                جستجو
              </Button>
            </div>
          </Field>

          <Field>
            <FieldLabel htmlFor="topic">دسته</FieldLabel>
            <Select value={topic} onValueChange={setTopic}>
              <SelectTrigger id="topic">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">همه</SelectItem>
                  {TOPICS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {TOPIC_LABELS[item as Topic]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="range">بازهٔ زمانی</FieldLabel>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger id="range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {RANGE_DAYS.map((range) => (
                    <SelectItem key={range.key} value={range.key}>
                      {range.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <div className="flex items-end gap-4 md:col-span-2 xl:col-span-4">
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <Checkbox checked={voiceOnly} onCheckedChange={(v) => setVoiceOnly(v === true)} />
              فقط ورودی صوتی
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <Checkbox checked={refusedOnly} onCheckedChange={(v) => setRefusedOnly(v === true)} />
              فقط مکالمات دارای امتناع
            </label>
          </div>
        </div>
      </SectionCard>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <SectionCard>
          <p className="py-8 text-center text-xs text-muted-foreground">
            مکالمه‌ای با این فیلترها پیدا نشد.
          </p>
        </SectionCard>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            const question = row.messages.find((message) => message.role === 'user');
            const answer = row.messages.find((message) => message.role === 'assistant');

            return (
              <li key={row.id}>
                <Link href={`/admin/conversations/${row.id}`}>
                  <Card className="transition-colors hover:border-primary/40">
                    <CardContent className="p-4">
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="latn">
                          {new Date(row.startedAt).toLocaleString('fa-IR')}
                        </span>
                        {row.topic && (
                          <Badge variant="secondary">
                            {TOPIC_LABELS[row.topic as Topic] ?? row.topic}
                          </Badge>
                        )}
                        <Badge variant="outline">
                          {row.inputMode === 'voice'
                            ? 'صوتی'
                            : row.inputMode === 'mixed'
                              ? 'ترکیبی'
                              : 'تایپی'}
                        </Badge>
                        <span className="latn">{row.messageCount} پیام</span>
                        {answer?.latencyMs && <span className="latn">{answer.latencyMs} ms</span>}
                        {answer?.wasRefused && <Badge variant="warning">امتناع</Badge>}
                      </div>

                      {question && <p className="line-clamp-1 text-sm">{question.content}</p>}
                      {answer && (
                        <p className="mt-1 line-clamp-2 text-xs leading-6 text-muted-foreground">
                          {answer.content}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1}
          >
            قبلی
          </Button>
          <span className="text-xs text-muted-foreground latn">
            {page} / {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            disabled={page === pageCount}
          >
            بعدی
          </Button>
        </div>
      )}
    </div>
  );
}
