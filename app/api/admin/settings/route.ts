import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/guard';
import { capabilities } from '@/lib/config/env';
import { prisma } from '@/lib/db/client';
import { getSettings } from '@/lib/db/settings';
import { badRequest, serverError, validationError } from '@/lib/http/errors';
import { settingsUpdateSchema } from '@/lib/validation/schemas';
import { TOOL_DEFINITIONS } from '@/lib/tools/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `GET /api/admin/settings` — خواندن تنظیمات (§۹.۲). */
export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  try {
    const settings = await getSettings();

    return NextResponse.json({
      settings,
      capabilities: capabilities(),
      tools: TOOL_DEFINITIONS.map((tool) => ({
        name: tool.name,
        label: tool.label,
        description: tool.description,
        timeoutMs: tool.timeoutMs,
      })),
    });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : 'خواندن تنظیمات ممکن نشد.');
  }
}

/** `PUT /api/admin/settings` — به‌روزرسانی تنظیمات. */
export async function PUT(request: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('بدنهٔ درخواست JSON معتبر نیست.');
  }

  const parsed = settingsUpdateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  // فقط ابزارهای شناخته‌شده پذیرفته می‌شوند.
  const knownTools = new Set(TOOL_DEFINITIONS.map((tool) => tool.name));
  const enabledTools = parsed.data.enabledTools?.filter((name) => knownTools.has(name));

  try {
    await getSettings(); // تضمین وجود ردیف singleton

    const settings = await prisma.settings.update({
      where: { id: 'singleton' },
      data: {
        ...parsed.data,
        ...(enabledTools ? { enabledTools } : {}),
        ...(parsed.data.refusalMessages
          ? { refusalMessages: parsed.data.refusalMessages }
          : {}),
      },
    });

    return NextResponse.json({ settings });
  } catch (error) {
    return serverError(
      error instanceof Error ? error.message : 'ذخیرهٔ تنظیمات ممکن نشد.',
    );
  }
}
