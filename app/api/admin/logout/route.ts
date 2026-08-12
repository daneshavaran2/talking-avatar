import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/auth/session';

export const runtime = 'nodejs';

/** `POST /api/admin/logout` — خروج از پنل مدیریت. */
export async function POST() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
