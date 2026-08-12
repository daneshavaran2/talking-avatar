import 'server-only';
import { prisma } from '@/lib/db/client';

/**
 * ثبت خطای سرویس‌ها (§۱۲.۳ / E2 و E3).
 *
 * دو مقصد: کنسول سرور برای عیب‌یابی فوری، و پایگاه داده تا مدیر
 * بتواند نرخ خطا را به تفکیک سرویس در داشبورد ببیند.
 *
 * این تابع خودش هرگز throw نمی‌کند — لاگ کردن خطا نباید عامل
 * خطای بعدی شود.
 */

export type ServiceName = 'llm' | 'tts' | 'stt' | 'avatar' | 'rag' | 'tool' | 'livekit' | 'auth';

export async function logServiceError(
  service: ServiceName,
  message: string,
  detail?: string,
  turnId?: string,
): Promise<void> {
  console.error(`[${service}] ${message}${detail ? ` — ${detail}` : ''}`);

  try {
    await prisma.serviceError.create({
      data: {
        service,
        message: message.slice(0, 500),
        detail: detail?.slice(0, 2000),
        turnId,
      },
    });
  } catch {
    // پایگاه داده در دسترس نیست؛ لاگ کنسول تنها چیزی است که داریم.
  }
}

/** پیام خطای امن برای نمایش به کاربر نهایی (§۱۲.۳ / E1). */
export function userFacingError(service: ServiceName): string {
  switch (service) {
    case 'tts':
      return 'صدا موقتاً در دسترس نیست؛ پاسخ را به‌صورت متنی می‌بینید.';
    case 'stt':
      return 'تشخیص گفتار در دسترس نیست. لطفاً سؤالتان را تایپ کنید.';
    case 'avatar':
      return 'تصویر آواتار موقتاً در دسترس نیست؛ گفتگو ادامه دارد.';
    case 'rag':
      return 'در این مورد اطلاعات کافی ندارم.';
    case 'tool':
      return 'فعلاً به این اطلاعات دسترسی ندارم.';
    case 'livekit':
      return 'در حال اتصال مجدد...';
    default:
      return 'مشکلی پیش آمد. لطفاً دوباره تلاش کنید.';
  }
}
