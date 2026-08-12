import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { RATE_LIMITS, UPLOAD_LIMITS } from '@/lib/config/constants';
import { requireAdminApi } from '@/lib/auth/guard';
import { capabilities } from '@/lib/config/env';
import { prisma } from '@/lib/db/client';
import { badRequest, notImplemented, tooManyRequests } from '@/lib/http/errors';
import { checkRateLimit, clientKey } from '@/lib/http/rate-limit';
import { detectFileType } from '@/lib/rag/extract';
import { scheduleIndexing } from '@/lib/rag/index-document';
import { contentKey, saveFile } from '@/lib/storage/files';

export const runtime = 'nodejs';

/** `GET /api/admin/documents` — فهرست اسناد و وضعیت ایندکس (§۹.۲). */
export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const documents = await prisma.document.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      fileName: true,
      fileType: true,
      status: true,
      errorMessage: true,
      pageCount: true,
      chunkCount: true,
      byteSize: true,
      indexedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    documents,
    embeddingConfigured: capabilities().embedding,
  });
}

/**
 * `POST /api/admin/documents` — آپلود سند (§F3).
 *
 * پردازش ناهمگام است (F3.5): پاسخ فوراً برمی‌گردد و وضعیت هر سند
 * در پایگاه داده به‌روز می‌شود تا مدیر پیشرفت را زنده ببیند.
 *
 * Idempotency (§۹.۳): کلید محتوایی از نام و بایت‌های فایل ساخته
 * می‌شود؛ آپلود دوبارهٔ همان فایل سند تکراری نمی‌سازد.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const limit = checkRateLimit(clientKey(request, 'upload'), RATE_LIMITS.upload);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  if (!capabilities().embedding) {
    return notImplemented(
      'rag',
      'سرویس تعبیه‌سازی پیکربندی نشده است؛ بدون آن سند قابل ایندکس نیست. ' +
        'ابتدا EMBEDDING_PROVIDER و کلید آن را تنظیم کنید.',
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest('فرم آپلود نامعتبر است.');
  }

  const files = form.getAll('files').filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) return badRequest('هیچ فایلی ارسال نشده است.');

  const limits = UPLOAD_LIMITS.document;
  const created: Array<{ id: string; fileName: string; status: string }> = [];
  const rejected: Array<{ fileName: string; reason: string }> = [];

  for (const file of files) {
    if (file.size > limits.maxBytes) {
      rejected.push({ fileName: file.name, reason: `حجم بیش از حد مجاز است. ${limits.label}` });
      continue;
    }

    const fileType = detectFileType(file.name, file.type);
    if (!fileType) {
      rejected.push({ fileName: file.name, reason: `فرمت پشتیبانی نمی‌شود. ${limits.label}` });
      continue;
    }

    const data = new Uint8Array(await file.arrayBuffer());
    const uploadKey = contentKey(data, file.name);

    const duplicate = await prisma.document.findUnique({ where: { uploadKey } });
    if (duplicate) {
      created.push({ id: duplicate.id, fileName: duplicate.fileName, status: duplicate.status });
      continue;
    }

    const stored = await saveFile('documents', data, file.name, file.type);

    const document = await prisma.document.create({
      data: {
        title: file.name.replace(/\.[^.]+$/, ''),
        fileName: file.name,
        fileType,
        sourceUrl: stored.url,
        byteSize: data.byteLength,
        uploadKey,
        status: 'pending',
      },
      select: { id: true, fileName: true, status: true },
    });

    created.push(document);
    scheduleIndexing(document.id);
  }

  return NextResponse.json({ created, rejected });
}
