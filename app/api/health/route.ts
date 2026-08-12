import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { capabilities } from '@/lib/config/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/health` — وضعیت سلامت برای Health Check و پایش.
 * گزارش می‌دهد کدام قابلیت‌ها واقعاً پیکربندی شده‌اند، تا هیچ‌کس
 * فرض نکند چیزی کار می‌کند که پیکربندی نشده است.
 */
export async function GET() {
  let database = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch {
    database = false;
  }

  const configured = capabilities();
  const healthy = database && configured.llm;

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      database,
      capabilities: configured,
    },
    { status: healthy ? 200 : 503 },
  );
}
