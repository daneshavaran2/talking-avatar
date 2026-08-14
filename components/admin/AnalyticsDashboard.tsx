'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { BarList, SectionCard, StatCard } from '@/components/admin/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CATEGORY_LABELS, LATENCY_BUDGET_MS, type BlockedCategory } from '@/lib/config/constants';
import { TOOL_LABEL_BY_NAME } from '@/lib/tools/labels';
import { cn } from '@/lib/utils';

/** داشبورد مدیریتی (§۱۰). همهٔ تجمیع سمت پایگاه داده انجام شده است. */

type Analytics = {
  summary: {
    conversations: number;
    messages: number;
    userMessages: number;
    assistantMessages: number;
    avgMessagesPerConversation: number;
    avgLatencyMs: number | null;
    successRate: number;
    refusals: number;
    voiceShare: number;
  };
  topics: Array<{ topic: string; label: string; count: number; percent: number }>;
  refusals: Array<{ reason: string; count: number }>;
  frequentQuestions: Array<{ question: string; count: number }>;
  hourly: Array<{ hour: number; count: number }>;
  latency: {
    sttMs: number | null;
    llmFirstTokenMs: number | null;
    ttsFirstAudioMs: number | null;
    avatarFirstFrameMs: number | null;
    endToEndMs: number | null;
    sampleSize: number;
  };
  serviceErrors: Array<{ service: string; count: number }>;
  turns: Record<string, number>;
  tools: Array<{ name: string; count: number; avgLatencyMs: number | null }>;
  unansweredCount: number;
};

type UnansweredRow = {
  id: string;
  question: string;
  askCount: number;
  lastAskedAt: string;
};

const RANGES = [
  { key: 'today', label: 'امروز', days: 1 },
  { key: 'week', label: '۷ روز', days: 7 },
  { key: 'month', label: '۳۰ روز', days: 30 },
] as const;

const SERVICE_LABELS: Record<string, string> = {
  llm: 'مدل زبانی',
  tts: 'تبدیل متن به صدا',
  stt: 'تشخیص گفتار',
  avatar: 'موتور آواتار',
  rag: 'پایگاه دانش',
  tool: 'ابزار خارجی',
  livekit: 'رسانهٔ بلادرنگ',
  auth: 'احراز هویت',
};

export function AnalyticsDashboard() {
  const [rangeKey, setRangeKey] = useState<string>('week');
  const [data, setData] = useState<Analytics | null>(null);
  const [unanswered, setUnanswered] = useState<UnansweredRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const days = RANGES.find((range) => range.key === rangeKey)?.days ?? 7;
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

    try {
      const [analyticsResponse, unansweredResponse] = await Promise.all([
        fetch(`/api/admin/analytics?from=${from.toISOString()}&to=${to.toISOString()}`),
        fetch('/api/admin/unanswered'),
      ]);

      if (!analyticsResponse.ok) {
        const body = (await analyticsResponse.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? 'خواندن آمار ممکن نشد.');
        return;
      }

      setData((await analyticsResponse.json()) as Analytics);

      if (unansweredResponse.ok) {
        const body = (await unansweredResponse.json()) as { questions: UnansweredRow[] };
        setUnanswered(body.questions);
      }
    } catch {
      toast.error('ارتباط با سرور برقرار نشد.');
    } finally {
      setLoading(false);
    }
  }, [rangeKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const resolveQuestion = async (id: string) => {
    await fetch('/api/admin/unanswered', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, resolved: true }),
    }).catch(() => {});
    setUnanswered((current) => current.filter((row) => row.id !== id));
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">داشبورد</h1>

        <Tabs value={rangeKey} onValueChange={setRangeKey}>
          <TabsList>
            {RANGES.map((range) => (
              <TabsTrigger key={range.key} value={range.key}>
                {range.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>

      {loading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard label="تعداد مکالمات" value={data.summary.conversations} />
            <StatCard
              label="تعداد پیام‌ها"
              value={data.summary.messages}
              hint={`${data.summary.userMessages} از کاربر · ${data.summary.assistantMessages} از آواتار`}
            />
            <StatCard
              label="میانگین طول مکالمه"
              value={data.summary.avgMessagesPerConversation}
              suffix="پیام"
            />
            <StatCard
              label="میانگین تأخیر پاسخ"
              value={data.summary.avgLatencyMs ?? '—'}
              suffix={data.summary.avgLatencyMs ? 'میلی‌ثانیه' : undefined}
              tone={
                data.summary.avgLatencyMs === null
                  ? 'default'
                  : data.summary.avgLatencyMs <= LATENCY_BUDGET_MS.total
                    ? 'good'
                    : 'warn'
              }
              hint={`بودجهٔ هدف: ${LATENCY_BUDGET_MS.total} میلی‌ثانیه`}
            />
            <StatCard
              label="نرخ پاسخ موفق"
              value={data.summary.successRate}
              suffix="٪"
              tone={data.summary.successRate >= 80 ? 'good' : 'warn'}
              hint="پاسخ‌هایی که نه امتناع بودند نه «نمی‌دانم»"
            />
            <StatCard
              label="تعداد امتناع‌ها"
              value={data.summary.refusals}
              hint={
                data.refusals.length > 0
                  ? data.refusals
                      .map(
                        (row) =>
                          `${CATEGORY_LABELS[row.reason as BlockedCategory] ?? row.reason}: ${row.count}`,
                      )
                      .join(' · ')
                  : undefined
              }
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <SectionCard
              title="دسته‌بندی موضوعی"
              description="روی هر دسته کلیک کنید تا مکالماتش را ببینید."
            >
              <BarList
                items={data.topics.map((topic) => ({
                  key: topic.topic,
                  label: topic.label,
                  count: topic.count,
                  percent: topic.percent,
                }))}
                onSelect={(key) => {
                  window.location.href = `/admin/conversations?topic=${encodeURIComponent(key)}`;
                }}
              />
            </SectionCard>

            <SectionCard
              title="تفکیک تأخیر"
              description={`میانگین هر مرحله در ${data.latency.sampleSize} نوبت کامل‌شده.`}
            >
              <LatencyBreakdown latency={data.latency} interrupted={data.turns.interrupted} />
            </SectionCard>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <SectionCard
              title="پرتکرارترین سؤالات"
              description="چه چیزی را باید در سایت یا پایگاه دانش برجسته کنید؟"
            >
              {data.frequentQuestions.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  هنوز سؤال تکراری ثبت نشده است.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {data.frequentQuestions.map((row, index) => (
                    <li
                      key={`${row.question}-${index}`}
                      className="flex items-start justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-xs"
                    >
                      <span className="line-clamp-2">{row.question}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground latn">
                        {row.count}×
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard
              title="سؤالات بی‌پاسخ"
              description="سؤالاتی که پایگاه دانش جوابی برایشان نداشت — فهرست کارهای بهبود شما."
              action={<Badge variant="warning">{data.unansweredCount}</Badge>}
            >
              {unanswered.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  سؤال بی‌پاسخی ثبت نشده است.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {unanswered.slice(0, 10).map((row) => (
                    <li
                      key={row.id}
                      className="flex items-start justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="line-clamp-2">{row.question}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          <span className="latn">{row.askCount}</span> بار پرسیده شده
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void resolveQuestion(row.id)}
                        className="shrink-0"
                      >
                        رسیدگی شد
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <SectionCard title="توزیع ساعتی مراجعات" description="چه ساعاتی بیشترین مراجعه را دارید؟">
              <HourlyChart hourly={data.hourly} />
            </SectionCard>

            <div className="flex flex-col gap-5">
              <SectionCard title="خطای سرویس‌ها" description="نرخ خطا به تفکیک لایه.">
                {data.serviceErrors.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    خطایی در این بازه ثبت نشده است.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {data.serviceErrors.map((row) => (
                      <li
                        key={row.service}
                        className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs"
                      >
                        <span>{SERVICE_LABELS[row.service] ?? row.service}</span>
                        <span className="tabular-nums text-destructive latn">{row.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>

              {data.tools.length > 0 && (
                <SectionCard title="ابزارهای خارجی" description="تعداد فراخوانی و میانگین زمان پاسخ.">
                  <ul className="flex flex-col gap-1.5">
                    {data.tools.map((row) => (
                      <li
                        key={row.name}
                        className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs"
                      >
                        <span>{TOOL_LABEL_BY_NAME[row.name] ?? row.name}</span>
                        <span className="tabular-nums text-muted-foreground latn">
                          {row.count}× · {row.avgLatencyMs ?? '—'}ms
                        </span>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              )}
            </div>
          </div>

          <div className="flex justify-center">
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/conversations">مشاهدهٔ آرشیو کامل مکالمات</Link>
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function LatencyBreakdown({
  latency,
  interrupted,
}: {
  latency: Analytics['latency'];
  interrupted?: number;
}) {
  const stages = [
    { label: 'تشخیص گفتار', value: latency.sttMs, budget: LATENCY_BUDGET_MS.stt },
    {
      label: 'اولین توکن مدل',
      value: latency.llmFirstTokenMs,
      budget: LATENCY_BUDGET_MS.llmFirstToken,
    },
    {
      label: 'اولین بایت صدا',
      value: latency.ttsFirstAudioMs,
      budget: LATENCY_BUDGET_MS.ttsFirstByte,
    },
    {
      label: 'اولین فریم آواتار',
      value: latency.avatarFirstFrameMs,
      budget: LATENCY_BUDGET_MS.avatarFirstFrame,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {stages.map((stage) => (
        <div key={stage.label}>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span>{stage.label}</span>
            <span className="tabular-nums text-muted-foreground latn">
              {stage.value === null ? 'اندازه‌گیری نشده' : `${stage.value} / ${stage.budget} ms`}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full',
                stage.value === null
                  ? 'w-0'
                  : stage.value <= stage.budget
                    ? 'bg-state-listening'
                    : 'bg-state-error',
              )}
              style={{
                width:
                  stage.value === null
                    ? 0
                    : `${Math.min(100, (stage.value / stage.budget) * 100)}%`,
              }}
            />
          </div>
        </div>
      ))}

      <div className="border-t pt-3">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-medium">پایان صحبت تا اولین صدا</span>
          <span
            className={cn(
              'tabular-nums latn',
              latency.endToEndMs === null
                ? 'text-muted-foreground'
                : latency.endToEndMs <= LATENCY_BUDGET_MS.total
                  ? 'text-state-listening'
                  : 'text-state-error',
            )}
          >
            {latency.endToEndMs === null ? 'اندازه‌گیری نشده' : `${latency.endToEndMs} ms`}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          شاخص اصلی محصول. مراحلی که «اندازه‌گیری نشده» هستند در این نصب فعال نیستند.
        </p>

        {interrupted ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            <span className="latn">{interrupted}</span> نوبت با قطع کردن کاربر (Barge-In) پایان
            یافته است.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function HourlyChart({ hourly }: { hourly: Analytics['hourly'] }) {
  const max = Math.max(1, ...hourly.map((row) => row.count));

  return (
    <div>
      <div className="flex h-32 items-end gap-[3px]">
        {hourly.map((row) => (
          <div
            key={row.hour}
            className="group relative flex-1"
            title={`ساعت ${row.hour}: ${row.count} مکالمه`}
          >
            <div
              className="w-full rounded-t bg-primary/60 transition-colors group-hover:bg-primary"
              style={{ height: `${Math.max(2, (row.count / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground latn">
        <span>0</span>
        <span>6</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>
    </div>
  );
}
