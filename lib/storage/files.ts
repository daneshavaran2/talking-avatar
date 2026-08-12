import 'server-only';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '@/lib/config/env';

/**
 * ذخیره‌سازی فایل‌های آپلودی.
 *
 * پیاده‌سازی فعلی: سیستم فایل محلی (در Docker یک volume). برای
 * مقیاس چند-نمونه‌ای باید به S3 یا معادلش منتقل شود — تنها این
 * فایل تغییر می‌کند.
 *
 * امنیت (§۱۱.۴ / S6): نام فایل ورودی هرگز در مسیر استفاده نمی‌شود؛
 * نام روی دیسک همیشه UUID تولیدشده توسط خودمان است تا Path
 * Traversal ممکن نباشد.
 */

export type StorageKind = 'avatars' | 'voices' | 'documents';

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/wave': '.wav',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt',
  'text/markdown': '.md',
};

export type StoredFile = {
  /** آدرس منطقی برای ذخیره در پایگاه داده و استفاده در UI */
  url: string;
  kind: StorageKind;
  name: string;
  byteSize: number;
};

function baseDir(): string {
  return path.resolve(process.cwd(), env.storageDir);
}

function safeExtension(fileName: string, mimeType: string): string {
  const fromMime = EXTENSION_BY_MIME[mimeType];
  if (fromMime) return fromMime;

  const ext = path.extname(fileName).toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '.bin';
}

export async function saveFile(
  kind: StorageKind,
  data: Uint8Array,
  fileName: string,
  mimeType: string,
): Promise<StoredFile> {
  const dir = path.join(baseDir(), kind);
  await mkdir(dir, { recursive: true });

  const name = `${randomUUID()}${safeExtension(fileName, mimeType)}`;
  await writeFile(path.join(dir, name), data);

  return { url: `/api/files/${kind}/${name}`, kind, name, byteSize: data.byteLength };
}

/**
 * خواندن فایل با نامی که از URL آمده.
 * نام باید دقیقاً الگوی تولیدی ما را داشته باشد؛ هر چیز دیگری رد می‌شود.
 */
export async function readStoredFile(
  kind: StorageKind,
  name: string,
): Promise<{ data: Buffer; contentType: string } | null> {
  if (!/^[0-9a-f-]{36}\.[a-z0-9]{1,5}$/i.test(name)) return null;

  try {
    const data = await readFile(path.join(baseDir(), kind, name));
    return { data, contentType: contentTypeFor(name) };
  } catch {
    return null;
  }
}

export async function deleteStoredFile(url: string): Promise<void> {
  const match = /^\/api\/files\/(avatars|voices|documents)\/([0-9a-f-]{36}\.[a-z0-9]{1,5})$/i.exec(
    url,
  );
  if (!match) return;

  try {
    await unlink(path.join(baseDir(), match[1] as StorageKind, match[2]!));
  } catch {
    // فایل از قبل نبوده — حذف idempotent است.
  }
}

export async function loadFromUrl(url: string): Promise<Buffer | null> {
  const match = /^\/api\/files\/(avatars|voices|documents)\/([0-9a-f-]{36}\.[a-z0-9]{1,5})$/i.exec(
    url,
  );
  if (!match) return null;

  const stored = await readStoredFile(match[1] as StorageKind, match[2]!);
  return stored?.data ?? null;
}

function contentTypeFor(name: string): string {
  const ext = path.extname(name).toLowerCase();
  const entry = Object.entries(EXTENSION_BY_MIME).find(([, value]) => value === ext);
  return entry?.[0] ?? 'application/octet-stream';
}

/** کلید یکتای محتوا — برای Idempotency آپلود (§۹.۳). */
export function contentKey(data: Uint8Array, fileName: string): string {
  return createHash('sha256')
    .update(fileName)
    .update(Buffer.from(data))
    .digest('hex')
    .slice(0, 32);
}
