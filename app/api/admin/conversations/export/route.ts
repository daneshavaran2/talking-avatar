import type { NextRequest } from 'next/server';
import { requireAdminApi } from '@/lib/auth/guard';
import { prisma } from '@/lib/db/client';
import { validationError } from '@/lib/http/errors';
import { conversationQuerySchema } from '@/lib/validation/schemas';
import { TOPIC_LABELS, type Topic } from '@/lib/config/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/admin/conversations/export` — خروجی CSV (§۱۰.۳).
 *
 * پاسخ به‌صورت جریانی ساخته می‌شود تا صادرات چند هزار ردیف حافظهٔ
 * سرور را پر نکند.
 *
 * BOM در ابتدای فایل لازم است وگرنه اکسل فارسی را با کدگذاری اشتباه
 * باز می‌کند و همه‌چیز به هم می‌ریزد.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const parsed = conversationQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) return validationError(parsed.error);

  const to = parsed.data.to ? new Date(parsed.data.to) : new Date();
  const from = parsed.data.from
    ? new Date(parsed.data.from)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

  const encoder = new TextEncoder();
  const BATCH = 200;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode('﻿'));
      controller.enqueue(
        encoder.encode(
          [
            'شناسه مکالمه',
            'زمان',
            'نقش',
            'نوع ورودی',
            'دسته',
            'متن',
            'امتناع',
            'دلیل امتناع',
            'استفاده از دانش',
            'تأخیر (میلی‌ثانیه)',
          ].join(',') + '\n',
        ),
      );

      let cursor: string | undefined;

      try {
        while (true) {
          const rows = await prisma.message.findMany({
            where: {
              createdAt: { gte: from, lte: to },
              ...(parsed.data.topic ? { topic: parsed.data.topic } : {}),
              ...(parsed.data.refusedOnly ? { wasRefused: true } : {}),
            },
            orderBy: { id: 'asc' },
            take: BATCH,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            select: {
              id: true,
              conversationId: true,
              role: true,
              inputType: true,
              topic: true,
              content: true,
              wasRefused: true,
              refusalReason: true,
              ragUsed: true,
              latencyMs: true,
              createdAt: true,
            },
          });

          if (rows.length === 0) break;

          const csv = rows
            .map((row) =>
              [
                row.conversationId,
                row.createdAt.toISOString(),
                row.role === 'user' ? 'کاربر' : 'آواتار',
                row.inputType === 'voice' ? 'صوتی' : 'تایپی',
                TOPIC_LABELS[(row.topic ?? 'other') as Topic] ?? '',
                row.content,
                row.wasRefused ? 'بله' : 'خیر',
                row.refusalReason ?? '',
                row.ragUsed ? 'بله' : 'خیر',
                row.latencyMs ?? '',
              ]
                .map(csvCell)
                .join(','),
            )
            .join('\n');

          controller.enqueue(encoder.encode(csv + '\n'));

          cursor = rows[rows.length - 1]!.id;
          if (rows.length < BATCH) break;
        }
      } catch {
        controller.enqueue(encoder.encode('\n# خطا در ادامهٔ صادرات\n'));
      } finally {
        controller.close();
      }
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(stream, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="conversations-${stamp}.csv"`,
      'cache-control': 'no-store',
    },
  });
}

/** فرار دادن مقدار برای CSV — نقل‌قول‌ها دوبل و کل مقدار محصور می‌شود. */
function csvCell(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  return `"${text.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
}
