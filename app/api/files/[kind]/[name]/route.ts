import type { NextRequest } from 'next/server';
import { notFound, unauthorized } from '@/lib/http/errors';
import { readStoredFile, type StorageKind } from '@/lib/storage/files';
import { getSession } from '@/lib/auth/session';

export const runtime = 'nodejs';

const VALID_KINDS: StorageKind[] = ['avatars', 'voices', 'documents'];

/**
 * `GET /api/files/:kind/:name` — سرو فایل‌های آپلودی.
 *
 * دسترسی:
 *   avatars    → عمومی (صفحهٔ آواتار برای همه باز است)
 *   voices     → فقط مدیر (نمونهٔ صدای شخص، دادهٔ حساس است)
 *   documents  → فقط مدیر (اسناد داخلی کسب‌وکار)
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ kind: string; name: string }> },
) {
  const { kind, name } = await context.params;

  if (!VALID_KINDS.includes(kind as StorageKind)) return notFound();

  if (kind !== 'avatars') {
    const session = await getSession();
    if (!session) return unauthorized();
  }

  const file = await readStoredFile(kind as StorageKind, name);
  if (!file) return notFound('فایل پیدا نشد.');

  return new Response(new Uint8Array(file.data), {
    headers: {
      'content-type': file.contentType,
      'content-length': String(file.data.byteLength),
      // نام فایل UUID است و محتوایش تغییر نمی‌کند، پس Cache طولانی امن است.
      'cache-control': kind === 'avatars' ? 'public, max-age=31536000, immutable' : 'private, no-store',
    },
  });
}
