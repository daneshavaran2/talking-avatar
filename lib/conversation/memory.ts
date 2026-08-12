import 'server-only';
import type { ChatMessage, LLMProvider } from '@/lib/ai/types';
import { prisma } from '@/lib/db/client';

/**
 * حافظهٔ مکالمه (§F4.4).
 *
 * برای جلوگیری از رشد بی‌رویهٔ Context:
 *  - ۱۰ پیام اخیر کامل نگه داشته می‌شوند
 *  - پیام‌های قدیمی‌تر به یک خلاصهٔ فشرده تبدیل می‌شوند
 *  - خلاصه هر ۱۰ پیام یک‌بار به‌روزرسانی می‌شود
 */

export const RECENT_WINDOW = 10;
const SUMMARY_EVERY = 10;
const SUMMARY_MAX_CHARS = 800;

export type ConversationMemory = {
  summary: string | null;
  recent: ChatMessage[];
};

export async function loadMemory(conversationId: string): Promise<ConversationMemory> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { summary: true },
  });

  const rows = await prisma.message.findMany({
    where: { conversationId, role: { in: ['user', 'assistant'] } },
    orderBy: { createdAt: 'desc' },
    take: RECENT_WINDOW,
    select: { role: true, content: true },
  });

  return {
    summary: conversation?.summary ?? null,
    recent: rows
      .reverse()
      .map((row) => ({ role: row.role as ChatMessage['role'], content: row.content })),
  };
}

/** حافظه را به پیام‌های آمادهٔ ارسال به مدل تبدیل می‌کند. */
export function memoryToMessages(memory: ConversationMemory): ChatMessage[] {
  const messages: ChatMessage[] = [];

  if (memory.summary) {
    messages.push({
      role: 'system',
      content: `خلاصهٔ بخش‌های قبلی این گفتگو:\n${memory.summary}`,
    });
  }

  messages.push(...memory.recent);
  return messages;
}

/**
 * اگر تعداد پیام‌ها به مضربی از SUMMARY_EVERY رسیده باشد، خلاصهٔ
 * مکالمه را به‌روزرسانی می‌کند.
 *
 * این کار عمداً «بی‌صدا» شکست می‌خورد: خلاصه‌سازی یک بهینه‌سازی است،
 * نه بخشی از مسیر پاسخ‌دهی، و نباید مکالمه را از کار بیندازد.
 */
export async function maybeUpdateSummary(
  conversationId: string,
  llm: LLMProvider,
  messageCount: number,
): Promise<void> {
  if (messageCount === 0 || messageCount % SUMMARY_EVERY !== 0) return;

  try {
    const older = await prisma.message.findMany({
      where: { conversationId, role: { in: ['user', 'assistant'] } },
      orderBy: { createdAt: 'asc' },
      take: Math.max(0, messageCount - RECENT_WINDOW),
      select: { role: true, content: true },
    });

    if (older.length === 0) return;

    const transcript = older
      .map((m) => `${m.role === 'user' ? 'کاربر' : 'دستیار'}: ${m.content}`)
      .join('\n');

    const chunks: string[] = [];
    for await (const chunk of llm.stream(
      [
        {
          role: 'user',
          content:
            'این بخش از گفتگو را در حداکثر پنج جملهٔ فارسی خلاصه کن. ' +
            'فقط اطلاعاتی را نگه دار که برای ادامهٔ گفتگو لازم است ' +
            '(نیاز کاربر، محصولات مطرح‌شده، تصمیم‌ها).\n\n' +
            transcript,
        },
      ],
      { temperature: 0.2, maxTokens: 300 },
    )) {
      if (chunk.type === 'text') chunks.push(chunk.text);
    }

    const summary = chunks.join('').trim().slice(0, SUMMARY_MAX_CHARS);
    if (!summary) return;

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { summary },
    });
  } catch {
    // خلاصه‌سازی اختیاری است؛ خطا نباید به کاربر برسد.
  }
}
