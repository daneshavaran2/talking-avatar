import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/guard';
import { serverError, validationError } from '@/lib/http/errors';
import { analyticsQuerySchema } from '@/lib/validation/schemas';
import {
  frequentQuestions,
  hourlyDistribution,
  latencyBreakdown,
  refusalBreakdown,
  serviceErrors,
  summaryCards,
  toolUsage,
  topicDistribution,
  turnStatusBreakdown,
} from '@/lib/analytics/aggregate';
import { prisma } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `GET /api/admin/analytics` — آمار کلی + دسته‌بندی موضوعی (§۹.۲). */
export async function GET(request: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const parsed = analyticsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) return validationError(parsed.error);

  const to = parsed.data.to ? new Date(parsed.data.to) : new Date();
  const from = parsed.data.from
    ? new Date(parsed.data.from)
    : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

  const range = { from, to };

  try {
    const [
      summary,
      topics,
      refusals,
      questions,
      hourly,
      latency,
      errors,
      turns,
      tools,
      unansweredCount,
    ] = await Promise.all([
      summaryCards(range),
      topicDistribution(range),
      refusalBreakdown(range),
      frequentQuestions(range),
      hourlyDistribution(range),
      latencyBreakdown(range),
      serviceErrors(range),
      turnStatusBreakdown(range),
      toolUsage(range),
      prisma.unansweredQuestion.count({ where: { resolved: false } }),
    ]);

    return NextResponse.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      summary,
      topics,
      refusals,
      frequentQuestions: questions,
      hourly,
      latency,
      serviceErrors: errors,
      turns,
      tools,
      unansweredCount,
    });
  } catch (error) {
    return serverError(
      error instanceof Error ? `محاسبهٔ آمار ممکن نشد: ${error.message}` : 'محاسبهٔ آمار ممکن نشد.',
    );
  }
}
