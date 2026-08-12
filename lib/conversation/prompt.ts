import 'server-only';
import type { Settings } from '@prisma/client';
import { guardrailPromptSection } from '@/lib/guardrails';
import { knowledgePromptSection, type RetrievalResult } from '@/lib/rag/retrieve';

/**
 * ساخت System Prompt نهایی (§۷.۴).
 *
 * ترتیب بخش‌ها عمدی است: هویت و لحن اول، بعد محدودیت‌ها، و
 * پایگاه دانش آخر — چون بیشتر مدل‌ها به انتهای Context وزن بیشتری
 * می‌دهند و قطعات بازیابی‌شده باید تازه‌ترین چیزی باشند که می‌بینند.
 */

export function buildSystemPrompt(options: {
  settings: Settings;
  retrieval: RetrievalResult;
  injectionSuspected: boolean;
  hasTools: boolean;
}): string {
  const { settings, retrieval, injectionSuspected, hasTools } = options;
  const sections: string[] = [settings.systemPrompt.trim()];

  if (hasTools) {
    sections.push(
      'ابزارها:\n' +
        'برای اطلاعات لحظه‌ای (قیمت، موجودی، وضعیت سفارش) حتماً از ابزارهای در دسترس استفاده کنید، ' +
        'حتی اگر عدد مشابهی در پایگاه دانش دیدید. اگر ابزار پاسخ نداد، صادقانه بگویید ' +
        'فعلاً به آن اطلاعات دسترسی ندارید.',
    );
  }

  const guardrails = guardrailPromptSection(settings, injectionSuspected);
  if (guardrails) sections.push(guardrails);

  const knowledge = knowledgePromptSection(retrieval);
  if (knowledge) sections.push(knowledge);

  return sections.join('\n\n');
}
