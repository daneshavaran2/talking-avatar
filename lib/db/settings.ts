import 'server-only';
import type { Settings } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { env } from '@/lib/config/env';
import {
  BLOCKED_CATEGORIES,
  DEFAULT_REFUSAL_MESSAGES,
  defaultSystemPrompt,
  type BlockedCategory,
} from '@/lib/config/constants';

/**
 * تنظیمات به‌صورت یک ردیف singleton نگهداری می‌شود.
 * اگر وجود نداشته باشد، با مقادیر پیش‌فرض ساخته می‌شود تا اپلیکیشن
 * حتی پیش از اجرای Setup Wizard قابل استفاده باشد.
 */
export async function getSettings(): Promise<Settings> {
  const existing = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  if (existing) return existing;

  return prisma.settings.create({
    data: {
      id: 'singleton',
      systemPrompt: defaultSystemPrompt(),
      llmProvider: env.llmProvider,
      llmModel: env.llmModel || 'gemini-2.0-flash',
      blockedCategories: [...BLOCKED_CATEGORIES].filter((c) => c !== 'personal_data'),
      refusalMessages: DEFAULT_REFUSAL_MESSAGES,
      customBlockedKeywords: [],
      enabledTools: [],
      kioskResetSeconds: env.kioskResetSeconds,
    },
  });
}

/**
 * پیام‌های امتناع از JSON پایگاه داده خوانده می‌شوند؛ اگر دسته‌ای
 * تعریف نشده بود به پیش‌فرض برمی‌گردیم تا هیچ‌وقت پیام خالی نماند.
 */
export function refusalMessagesFor(settings: Settings, category: BlockedCategory): string[] {
  const stored = settings.refusalMessages as Record<string, unknown> | null;
  const value = stored?.[category];

  if (Array.isArray(value)) {
    const messages = value.filter((m): m is string => typeof m === 'string' && m.trim().length > 0);
    if (messages.length > 0) return messages;
  }
  if (typeof value === 'string' && value.trim()) return [value];

  return DEFAULT_REFUSAL_MESSAGES[category];
}

/** انتخاب یک پیام امتناع به‌صورت تصادفی تا پاسخ‌ها رباتیک نشوند (F11.5). */
export function pickRefusalMessage(settings: Settings, category: BlockedCategory): string {
  const messages = refusalMessagesFor(settings, category);
  const index = Math.floor(Math.random() * messages.length);
  return messages[index] ?? messages[0]!;
}
