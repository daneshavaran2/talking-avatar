import 'server-only';
import type { Settings } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { searchSimilarChunks, type ChunkMatch } from '@/lib/db/vector';
import { createEmbeddingProvider } from '@/lib/ai/embeddings';
import { normalizeForMatching } from '@/lib/text/persian';
import { logServiceError } from '@/lib/observability/log';

/**
 * خط لولهٔ پرس‌وجوی RAG (§F3).
 *
 *   سؤال → بردار → جستجوی شباهت → فیلتر آستانه → تزریق به Context
 *
 * قاعدهٔ حیاتی (F3.9): اگر هیچ قطعه‌ای بالای آستانه نبود، سیستم
 * **حدس نمی‌زند**. سؤال در فهرست «سؤالات بی‌پاسخ» ثبت می‌شود تا
 * مدیر بداند چه چیزی به پایگاه دانش اضافه کند.
 */

export type RetrievalResult = {
  /** آیا پایگاه دانشی وجود دارد؟ (سند ایندکس‌شده) */
  hasKnowledgeBase: boolean;
  matches: ChunkMatch[];
  /** متن آمادهٔ تزریق به System Prompt */
  context: string;
  sources: Array<{ title: string; page: number | null }>;
};

const EMPTY: RetrievalResult = {
  hasKnowledgeBase: false,
  matches: [],
  context: '',
  sources: [],
};

export async function retrieve(
  question: string,
  settings: Settings,
  signal?: AbortSignal,
): Promise<RetrievalResult> {
  const indexedCount = await prisma.document.count({ where: { status: 'indexed' } });
  if (indexedCount === 0) return EMPTY;

  try {
    const embedder = createEmbeddingProvider();
    const [vector] = await embedder.embed([question], 'query', signal);
    if (!vector) return { ...EMPTY, hasKnowledgeBase: true };

    // کمی بیشتر از topK می‌گیریم تا پس از فیلتر آستانه هم چیزی بماند.
    const candidates = await searchSimilarChunks(vector, settings.ragTopK * 2);
    const matches = candidates
      .filter((match) => match.similarity >= settings.ragThreshold)
      .slice(0, settings.ragTopK);

    return {
      hasKnowledgeBase: true,
      matches,
      context: buildContext(matches),
      sources: dedupeSources(matches),
    };
  } catch (error) {
    // خرابی RAG نباید مکالمه را قطع کند (§۱۲.۲)؛ ولی حدس هم نمی‌زنیم.
    await logServiceError(
      'rag',
      'بازیابی از پایگاه دانش شکست خورد',
      error instanceof Error ? error.message : String(error),
    );
    return { ...EMPTY, hasKnowledgeBase: true };
  }
}

function buildContext(matches: ChunkMatch[]): string {
  if (matches.length === 0) return '';

  return matches
    .map((match, index) => {
      const location = match.page ? `صفحهٔ ${match.page}` : 'بدون شمارهٔ صفحه';
      const section = match.section ? ` — ${match.section}` : '';
      return `[قطعهٔ ${index + 1}] منبع: «${match.documentTitle}» (${location}${section})\n${match.content}`;
    })
    .join('\n\n---\n\n');
}

function dedupeSources(matches: ChunkMatch[]): Array<{ title: string; page: number | null }> {
  const seen = new Set<string>();
  const sources: Array<{ title: string; page: number | null }> = [];

  for (const match of matches) {
    const key = `${match.documentTitle}#${match.page ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({ title: match.documentTitle, page: match.page });
  }

  return sources;
}

/**
 * بخش پایگاه دانش در System Prompt.
 *
 * دستور صریح «فقط بر اساس متن زیر پاسخ بده» عمداً تکرار می‌شود؛
 * بدون آن، مدل به دانش عمومی خودش برمی‌گردد و هدف G2 (۹۰٪ پاسخ
 * مبتنی بر اسناد) از دست می‌رود.
 */
export function knowledgePromptSection(result: RetrievalResult): string {
  if (result.matches.length === 0) {
    if (!result.hasKnowledgeBase) return '';
    return (
      'پایگاه دانش برای این سؤال هیچ مطلب مرتبطی نداشت. ' +
      'صادقانه بگویید در این مورد اطلاعات کافی ندارید و حدس نزنید.'
    );
  }

  return (
    'برای پاسخ به سؤال کاربر فقط از قطعات زیر استفاده کنید. ' +
    'اگر پاسخ در این قطعات نیست، صادقانه بگویید اطلاعات کافی ندارید و چیزی از خودتان نسازید. ' +
    'در پاسخ صوتی شمارهٔ قطعه را نخوانید؛ در صورت لزوم فقط نام سند را بگویید.\n\n' +
    `متن بازیابی‌شده از پایگاه دانش:\n${result.context}`
  );
}

/**
 * ثبت سؤال بی‌پاسخ (F3، فهرست کارهای بهبود پایگاه دانش).
 * سؤال‌های هم‌شکل با هم تجمیع می‌شوند تا فهرست مدیر تمیز بماند.
 */
export async function recordUnanswered(question: string): Promise<void> {
  const normalized = normalizeForMatching(question).slice(0, 300);
  if (normalized.length < 3) return;

  try {
    await prisma.unansweredQuestion.upsert({
      where: { normalized },
      create: { question: question.slice(0, 500), normalized },
      update: { askCount: { increment: 1 }, lastAskedAt: new Date(), resolved: false },
    });
  } catch {
    // ثبت آماری است؛ نباید مسیر پاسخ‌دهی را متوقف کند.
  }
}
