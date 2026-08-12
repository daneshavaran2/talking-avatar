import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { RATE_LIMITS, UPLOAD_LIMITS } from '@/lib/config/constants';
import { requireAdminApi } from '@/lib/auth/guard';
import { createAvatarProvider } from '@/lib/avatar/factory';
import { prisma } from '@/lib/db/client';
import { badRequest, serverError, tooManyRequests } from '@/lib/http/errors';
import { checkRateLimit, clientKey } from '@/lib/http/rate-limit';
import { logServiceError } from '@/lib/observability/log';
import { deleteStoredFile, saveFile } from '@/lib/storage/files';

export const runtime = 'nodejs';

/** `GET /api/admin/avatar` — وضعیت آواتار فعال (§۹.۲). */
export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const profile = await prisma.avatarProfile.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      imageUrl: true,
      status: true,
      errorMessage: true,
      idleLoopUrl: true,
      width: true,
      height: true,
      updatedAt: true,
    },
  });

  const provider = createAvatarProvider();

  return NextResponse.json({
    profile,
    realtimeAvailable: provider.available,
  });
}

/**
 * `POST /api/admin/avatar` — آپلود و پردازش عکس (§F1).
 *
 * خط لوله: اعتبارسنجی → ذخیره → تشخیص چهره و پیش‌پردازش روی سرویس
 * GPU → Cache نتیجه (F1.5).
 *
 * اگر سرویس GPU پیکربندی نشده باشد، عکس ذخیره و فعال می‌شود ولی
 * وضعیت صادقانه اعلام می‌کند که تشخیص چهره و حلقهٔ Idle انجام
 * نشده — نه اینکه وانمود کند همه‌چیز آماده است.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const limit = checkRateLimit(clientKey(request, 'upload'), RATE_LIMITS.upload);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest('فرم آپلود نامعتبر است.');
  }

  const file = form.get('image');
  if (!(file instanceof File)) return badRequest('فایل عکس ارسال نشده است.');

  const limits = UPLOAD_LIMITS.avatarImage;
  if (file.size > limits.maxBytes) {
    return badRequest(`حجم فایل بیش از حد مجاز است. ${limits.label}`);
  }
  if (!limits.mimeTypes.includes(file.type as (typeof limits.mimeTypes)[number])) {
    return badRequest(`فرمت فایل پشتیبانی نمی‌شود. ${limits.label}`);
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const stored = await saveFile('avatars', data, file.name, file.type);

  const provider = createAvatarProvider();

  // پروفایل قبلی غیرفعال می‌شود؛ فقط یک آواتار در هر نصب (§۲.۳).
  const previous = await prisma.avatarProfile.findMany({ where: { isActive: true } });

  const profile = await prisma.avatarProfile.create({
    data: {
      imageUrl: stored.url,
      status: provider.available ? 'processing' : 'ready',
      isActive: true,
      errorMessage: provider.available
        ? null
        : 'موتور آواتار پیکربندی نشده است؛ تشخیص چهره و حلقهٔ Idle انجام نشد. تصویر ثابت نمایش داده می‌شود.',
    },
  });

  await prisma.avatarProfile.updateMany({
    where: { id: { in: previous.map((p) => p.id) } },
    data: { isActive: false },
  });

  if (!provider.available || !provider.prepareFace) {
    return NextResponse.json({
      profile,
      realtimeAvailable: false,
      warning:
        'عکس ذخیره شد، ولی موتور آواتار (media-engine) پیکربندی نشده است. ' +
        'تشخیص چهره، نقاط کلیدی و حلقهٔ Idle انجام نشده و آواتار به‌صورت تصویر ثابت نمایش داده می‌شود.',
    });
  }

  // پیش‌پردازش ناهمگام: پاسخ HTTP معطل رندر GPU نمی‌ماند.
  void (async () => {
    try {
      const preparation = await provider.prepareFace!({
        data,
        fileName: file.name,
        mimeType: file.type,
      });

      if (preparation.faceCount === 0) {
        await prisma.avatarProfile.update({
          where: { id: profile.id },
          data: {
            status: 'error',
            errorMessage: 'چهره‌ای در عکس پیدا نشد. لطفاً عکسی با یک چهرهٔ واضح و روبه‌رو آپلود کنید.',
          },
        });
        return;
      }

      if (preparation.faceCount > 1) {
        await prisma.avatarProfile.update({
          where: { id: profile.id },
          data: {
            status: 'error',
            errorMessage: `${preparation.faceCount} چهره در عکس پیدا شد. لطفاً عکسی با دقیقاً یک چهره آپلود کنید.`,
          },
        });
        return;
      }

      await prisma.avatarProfile.update({
        where: { id: profile.id },
        data: {
          status: 'ready',
          errorMessage: null,
          landmarksJson: (preparation.landmarks ?? undefined) as never,
          embeddingJson: (preparation.embedding ?? undefined) as never,
          idleLoopUrl: preparation.idleLoopUrl ?? null,
          width: preparation.width ?? null,
          height: preparation.height ?? null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await logServiceError('avatar', 'پیش‌پردازش چهره شکست خورد', message);
      await prisma.avatarProfile
        .update({
          where: { id: profile.id },
          data: { status: 'error', errorMessage: message.slice(0, 500) },
        })
        .catch(() => null);
    }
  })();

  return NextResponse.json({ profile, realtimeAvailable: true });
}

/** `DELETE /api/admin/avatar` — حذف آواتار فعال و فایلش. */
export async function DELETE() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  try {
    const profiles = await prisma.avatarProfile.findMany({ where: { isActive: true } });
    for (const profile of profiles) await deleteStoredFile(profile.imageUrl);
    await prisma.avatarProfile.deleteMany({ where: { isActive: true } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    await logServiceError(
      'avatar',
      'حذف آواتار شکست خورد',
      error instanceof Error ? error.message : String(error),
    );
    return serverError();
  }
}
