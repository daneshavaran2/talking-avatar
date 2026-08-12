import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { TOPIC_LABELS, type Topic } from '@/lib/config/constants';

/**
 * تجمیع آمار داشبورد (§۱۰).
 *
 * الزام صریح سند: **تجمیع سمت پایگاه داده انجام شود، نه در حافظهٔ
 * اپلیکیشن.** با ۱۰ هزار مکالمه، کشیدن همهٔ ردیف‌ها به Node و
 * شمردن‌شان هم حافظه را می‌ترکاند هم کند است. همهٔ توابع اینجا
 * GROUP BY و AVG را به Postgres می‌سپارند.
 */

export type DateRange = { from: Date; to: Date };

export type SummaryCards = {
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

export async function summaryCards(range: DateRange): Promise<SummaryCards> {
  const where = { createdAt: { gte: range.from, lte: range.to } };

  const [conversations, byRole, latency, refusals, voiceCount] = await Promise.all([
    prisma.conversation.count({ where: { startedAt: { gte: range.from, lte: range.to } } }),
    prisma.message.groupBy({ by: ['role'], where, _count: { _all: true } }),
    prisma.message.aggregate({
      where: { ...where, role: 'assistant', latencyMs: { not: null } },
      _avg: { latencyMs: true },
    }),
    prisma.message.count({ where: { ...where, role: 'assistant', wasRefused: true } }),
    prisma.message.count({ where: { ...where, role: 'user', inputType: 'voice' } }),
  ]);

  const userMessages = byRole.find((row) => row.role === 'user')?._count._all ?? 0;
  const assistantMessages = byRole.find((row) => row.role === 'assistant')?._count._all ?? 0;
  const messages = byRole.reduce((sum, row) => sum + row._count._all, 0);

  // نرخ پاسخ موفق: پاسخ‌هایی که نه امتناع بودند نه «نمی‌دانم».
  const unanswered = await prisma.message.count({
    where: {
      ...where,
      role: 'assistant',
      wasRefused: false,
      ragUsed: false,
      content: { contains: 'اطلاعات کافی', mode: 'insensitive' },
    },
  });

  const successful = Math.max(0, assistantMessages - refusals - unanswered);

  return {
    conversations,
    messages,
    userMessages,
    assistantMessages,
    avgMessagesPerConversation: conversations > 0 ? round(messages / conversations, 1) : 0,
    avgLatencyMs: latency._avg.latencyMs !== null ? Math.round(latency._avg.latencyMs) : null,
    successRate: assistantMessages > 0 ? round((successful / assistantMessages) * 100, 1) : 0,
    refusals,
    voiceShare: userMessages > 0 ? round((voiceCount / userMessages) * 100, 1) : 0,
  };
}

export type TopicSlice = { topic: Topic; label: string; count: number; percent: number };

export async function topicDistribution(range: DateRange): Promise<TopicSlice[]> {
  const rows = await prisma.message.groupBy({
    by: ['topic'],
    where: { role: 'user', createdAt: { gte: range.from, lte: range.to } },
    _count: { _all: true },
    orderBy: { _count: { topic: 'desc' } },
  });

  const total = rows.reduce((sum, row) => sum + row._count._all, 0);
  if (total === 0) return [];

  return rows
    .map((row) => {
      const topic = (row.topic ?? 'other') as Topic;
      return {
        topic,
        label: TOPIC_LABELS[topic] ?? TOPIC_LABELS.other,
        count: row._count._all,
        percent: round((row._count._all / total) * 100, 1),
      };
    })
    .sort((a, b) => b.count - a.count);
}

export type RefusalSlice = { reason: string; count: number };

export async function refusalBreakdown(range: DateRange): Promise<RefusalSlice[]> {
  const rows = await prisma.message.groupBy({
    by: ['refusalReason'],
    where: {
      role: 'assistant',
      wasRefused: true,
      createdAt: { gte: range.from, lte: range.to },
    },
    _count: { _all: true },
  });

  return rows
    .map((row) => ({ reason: row.refusalReason ?? 'unknown', count: row._count._all }))
    .sort((a, b) => b.count - a.count);
}

/**
 * پرتکرارترین سؤالات.
 *
 * خوشه‌بندی روی متن نرمال‌شده انجام می‌شود (بدون علائم و نیم‌فاصله)
 * تا «قیمتش چنده؟» و «قیمتش چند است» یکی شمرده شوند. این همان
 * رویکرد کلیدواژه‌ای فاز اول است؛ خوشه‌بندی معنایی پس از جمع شدن
 * دادهٔ کافی جایگزینش می‌شود (§۱۰.۲).
 */
export type FrequentQuestion = { question: string; count: number };

export async function frequentQuestions(
  range: DateRange,
  limit = 12,
): Promise<FrequentQuestion[]> {
  const rows = await prisma.$queryRaw<Array<{ question: string; count: bigint }>>`
    SELECT
      MIN("content")   AS question,
      COUNT(*)::bigint AS count
    FROM "Message"
    WHERE "role" = 'user'
      AND "createdAt" BETWEEN ${range.from} AND ${range.to}
    GROUP BY lower(regexp_replace("content", '[^\\w\\s\\u0600-\\u06FF]', '', 'g'))
    HAVING COUNT(*) > 1
    ORDER BY count DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({ question: row.question, count: Number(row.count) }));
}

/** توزیع ساعتی مراجعات — «چه ساعاتی بیشترین مراجعه را دارم؟» */
export type HourSlice = { hour: number; count: number };

export async function hourlyDistribution(range: DateRange): Promise<HourSlice[]> {
  const rows = await prisma.$queryRaw<Array<{ hour: number; count: bigint }>>`
    SELECT
      EXTRACT(HOUR FROM "startedAt")::int AS hour,
      COUNT(*)::bigint                    AS count
    FROM "Conversation"
    WHERE "startedAt" BETWEEN ${range.from} AND ${range.to}
    GROUP BY 1
    ORDER BY 1
  `;

  const byHour = new Map(rows.map((row) => [row.hour, Number(row.count)]));
  return Array.from({ length: 24 }, (_, hour) => ({ hour, count: byHour.get(hour) ?? 0 }));
}

/**
 * تفکیک تأخیر هر مرحله (§۱۰.۵).
 *
 * از جدول `Turn` محاسبه می‌شود که زمان‌بندی هر مرحله را از فاز ۱
 * ثبت می‌کند. مقادیر null یعنی آن مرحله در این نصب فعال نیست
 * (مثلاً آواتار بلادرنگ) — که صادقانه‌تر از نشان دادن صفر است.
 */
export type LatencyBreakdown = {
  sttMs: number | null;
  llmFirstTokenMs: number | null;
  ttsFirstAudioMs: number | null;
  avatarFirstFrameMs: number | null;
  endToEndMs: number | null;
  sampleSize: number;
};

export async function latencyBreakdown(range: DateRange): Promise<LatencyBreakdown> {
  const rows = await prisma.$queryRaw<
    Array<{
      stt: number | null;
      llm: number | null;
      tts: number | null;
      avatar: number | null;
      e2e: number | null;
      samples: bigint;
    }>
  >`
    SELECT
      AVG(EXTRACT(EPOCH FROM ("sttEndAt"      - "sttStartAt"))   * 1000) AS stt,
      AVG(EXTRACT(EPOCH FROM ("firstTokenAt"  - "llmStartAt"))   * 1000) AS llm,
      AVG(EXTRACT(EPOCH FROM ("firstAudioAt"  - "ttsStartAt"))   * 1000) AS tts,
      AVG(EXTRACT(EPOCH FROM ("firstFrameAt"  - "avatarStartAt")) * 1000) AS avatar,
      AVG(EXTRACT(EPOCH FROM ("firstAudioAt"  - "sttEndAt"))     * 1000) AS e2e,
      COUNT(*)::bigint AS samples
    FROM "Turn"
    WHERE "createdAt" BETWEEN ${range.from} AND ${range.to}
      AND "status" = 'completed'
  `;

  const row = rows[0];
  return {
    sttMs: toRoundedOrNull(row?.stt),
    llmFirstTokenMs: toRoundedOrNull(row?.llm),
    ttsFirstAudioMs: toRoundedOrNull(row?.tts),
    avatarFirstFrameMs: toRoundedOrNull(row?.avatar),
    endToEndMs: toRoundedOrNull(row?.e2e),
    sampleSize: Number(row?.samples ?? 0),
  };
}

/** نرخ خطا به تفکیک سرویس (§۱۰.۵ و E3). */
export type ServiceErrorSlice = { service: string; count: number };

export async function serviceErrors(range: DateRange): Promise<ServiceErrorSlice[]> {
  const rows = await prisma.serviceError.groupBy({
    by: ['service'],
    where: { createdAt: { gte: range.from, lte: range.to } },
    _count: { _all: true },
  });

  return rows
    .map((row) => ({ service: row.service, count: row._count._all }))
    .sort((a, b) => b.count - a.count);
}

/** آمار Barge-In: چند نوبت قطع شده است. */
export async function turnStatusBreakdown(range: DateRange): Promise<Record<string, number>> {
  const rows = await prisma.turn.groupBy({
    by: ['status'],
    where: { createdAt: { gte: range.from, lte: range.to } },
    _count: { _all: true },
  });

  return Object.fromEntries(rows.map((row) => [row.status, row._count._all]));
}

/** آمار فراخوانی ابزارها. */
export type ToolUsageSlice = { name: string; count: number; avgLatencyMs: number | null };

export async function toolUsage(range: DateRange): Promise<ToolUsageSlice[]> {
  const rows = await prisma.toolCall.groupBy({
    by: ['name'],
    where: { createdAt: { gte: range.from, lte: range.to } },
    _count: { _all: true },
    _avg: { latencyMs: true },
  });

  return rows
    .map((row) => ({
      name: row.name,
      count: row._count._all,
      avgLatencyMs: row._avg.latencyMs !== null ? Math.round(row._avg.latencyMs) : null,
    }))
    .sort((a, b) => b.count - a.count);
}

// ── جستجو و فیلتر آرشیو مکالمات (§۱۰.۳) ───────────────────────

export type ConversationFilters = {
  from: Date;
  to: Date;
  topic?: string;
  search?: string;
  inputType?: 'text' | 'voice';
  refusedOnly?: boolean;
  page: number;
  pageSize: number;
};

export async function conversationArchive(filters: ConversationFilters) {
  const messageFilter: Prisma.MessageWhereInput = {};
  if (filters.search) {
    messageFilter.content = { contains: filters.search, mode: 'insensitive' };
  }
  if (filters.inputType) messageFilter.inputType = filters.inputType;
  if (filters.refusedOnly) messageFilter.wasRefused = true;

  const where: Prisma.ConversationWhereInput = {
    startedAt: { gte: filters.from, lte: filters.to },
    ...(filters.topic ? { topic: filters.topic } : {}),
    ...(Object.keys(messageFilter).length > 0 ? { messages: { some: messageFilter } } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      select: {
        id: true,
        topic: true,
        inputMode: true,
        messageCount: true,
        startedAt: true,
        endedAt: true,
        messages: {
          where: { role: { in: ['user', 'assistant'] } },
          orderBy: { createdAt: 'asc' },
          take: 2,
          select: { role: true, content: true, wasRefused: true, latencyMs: true },
        },
      },
    }),
  ]);

  return { total, rows, pageCount: Math.max(1, Math.ceil(total / filters.pageSize)) };
}

// ── کمکی‌ها ────────────────────────────────────────────────────

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toRoundedOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.round(value);
}
