import { NextResponse } from 'next/server';
import { capabilities } from '@/lib/config/env';
import { prisma } from '@/lib/db/client';
import { getSettings } from '@/lib/db/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/config` — پیکربندی عمومی برای رابط کاربری.
 *
 * فقط چیزهایی که کلاینت واقعاً لازم دارد برگردانده می‌شود. هیچ
 * کلید، آدرس داخلی یا نام سرویسی اینجا نیست (§۱۱.۱).
 *
 * هدف این مسیر صداقت UI است: رابط کاربری باید بداند کدام قابلیت
 * پیکربندی نشده تا آن را **غیرفعال** کند، نه اینکه دکمه‌ای نشان
 * دهد که کار نمی‌کند.
 */
export async function GET() {
  const configured = capabilities();

  const [avatar, voiceReady, settings, indexedDocs] = await Promise.all([
    prisma.avatarProfile.findFirst({
      where: { isActive: true },
      select: { imageUrl: true, status: true, idleLoopUrl: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.voiceProfile.count({ where: { isActive: true, status: 'ready' } }),
    getSettings().catch(() => null),
    prisma.document.count({ where: { status: 'indexed' } }),
  ]);

  return NextResponse.json({
    businessName: settings?.businessName ?? 'دستیار دیجیتال',
    setupCompleted: settings?.setupCompleted ?? false,
    kioskResetSeconds: settings?.kioskResetSeconds ?? 120,
    knowledgeBaseReady: indexedDocs > 0,
    avatar: {
      imageUrl: avatar?.status === 'ready' || avatar?.status === 'pending' ? avatar.imageUrl : null,
      idleLoopUrl: avatar?.idleLoopUrl ?? null,
      /** آیا رندر بلادرنگ فعال است، یا فقط تصویر ثابت داریم؟ */
      realtime: configured.avatar,
    },
    speech: {
      ttsAvailable: configured.tts && voiceReady > 0,
      /** browser = تشخیص گفتار در مرورگر · server = روی سرویس GPU · off */
      sttMode: configured.stt,
    },
    livekit: configured.livekit,
  });
}
