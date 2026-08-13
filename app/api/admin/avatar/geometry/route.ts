import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { Prisma } from '@prisma/client';

import { requireAdminApi } from '@/lib/auth/guard';
import { prisma } from '@/lib/db/client';
import { badRequest, notFound, validationError } from '@/lib/http/errors';
import { DEFAULT_FACE_GEOMETRY, geometryFromLandmarks } from '@/lib/lipsync/geometry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const boxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.01).max(1),
  height: z.number().min(0.005).max(1),
});

const geometrySchema = z.object({
  mouth: boxSchema,
  leftEye: boxSchema,
  rightEye: boxSchema,
  chinY: z.number().min(0).max(1),
});

/**
 * `GET /api/admin/avatar/geometry` — هندسهٔ فعلی چهره.
 *
 * ترتیب اولویت: تنظیم دستی مدیر → نقاط کلیدی MediaPipe → پیش‌فرض
 * تن‌سنجی. همیشه چیزی برمی‌گردد تا رابط کاربری نقطهٔ شروع داشته باشد.
 */
export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const profile = await prisma.avatarProfile.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, imageUrl: true, faceGeometry: true, landmarksJson: true },
  });

  if (!profile) return notFound('هنوز آواتاری تنظیم نشده است.');

  const fromLandmarks = profile.landmarksJson
    ? geometryFromLandmarks(profile.landmarksJson)
    : null;

  return NextResponse.json({
    imageUrl: profile.imageUrl,
    geometry: profile.faceGeometry ?? fromLandmarks ?? DEFAULT_FACE_GEOMETRY,
    /** آیا مقدار فعلی از تشخیص خودکار آمده یا دستی تنظیم شده؟ */
    source: profile.faceGeometry ? 'manual' : fromLandmarks ? 'landmarks' : 'default',
  });
}

/** `PUT /api/admin/avatar/geometry` — ذخیرهٔ کالیبراسیون دستی. */
export async function PUT(request: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('بدنهٔ درخواست JSON معتبر نیست.');
  }

  const parsed = geometrySchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const profile = await prisma.avatarProfile.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });

  if (!profile) return notFound('هنوز آواتاری تنظیم نشده است.');

  await prisma.avatarProfile.update({
    where: { id: profile.id },
    data: { faceGeometry: parsed.data },
  });

  return NextResponse.json({ geometry: parsed.data, source: 'manual' });
}

/** `DELETE` — بازگشت به تشخیص خودکار یا پیش‌فرض. */
export async function DELETE() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const profile = await prisma.avatarProfile.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });

  if (!profile) return notFound('هنوز آواتاری تنظیم نشده است.');

  await prisma.avatarProfile.update({
    where: { id: profile.id },
    data: { faceGeometry: Prisma.DbNull },
  });

  return NextResponse.json({ ok: true });
}
