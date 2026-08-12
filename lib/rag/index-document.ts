import 'server-only';
import { prisma } from '@/lib/db/client';
import { setChunkEmbeddings } from '@/lib/db/vector';
import { createEmbeddingProvider } from '@/lib/ai/embeddings';
import { loadFromUrl } from '@/lib/storage/files';
import { logServiceError } from '@/lib/observability/log';
import { chunkPages } from '@/lib/rag/chunk';
import {
  detectFileType,
  extractDocument,
  removeRepeatedHeaders,
  type SupportedFileType,
} from '@/lib/rag/extract';

/**
 * خط لولهٔ ایندکس کردن سند (§F3).
 *
 *   استخراج → پاک‌سازی → قطعه‌بندی → Embedding → ذخیره در pgvector
 *
 * پردازش ناهمگام است (F3.5): مسیر آپلود بلافاصله پاسخ می‌دهد و
 * وضعیت در پایگاه داده به‌روز می‌شود تا مدیر پیشرفت را زنده ببیند.
 */

const EMBEDDING_BATCH = 32;

export async function indexDocument(documentId: string): Promise<void> {
  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document) return;

  await prisma.document.update({
    where: { id: documentId },
    data: { status: 'processing', errorMessage: null },
  });

  try {
    const data = await loadFromUrl(document.sourceUrl);
    if (!data) throw new Error('فایل سند روی دیسک پیدا نشد.');

    const fileType = (document.fileType as SupportedFileType) ?? detectFileType(document.fileName, '');
    if (!fileType) throw new Error('نوع فایل پشتیبانی نمی‌شود.');

    const extraction = await extractDocument(new Uint8Array(data), fileType);

    if (extraction.likelyScanned) {
      // OCR فارسی روی سرویس GPU انجام می‌شود؛ اگر آن سرویس نصب
      // نباشد، صادقانه اعلام می‌کنیم به‌جای ایندکس کردن سند خالی.
      throw new Error(
        'متنی از این فایل استخراج نشد. احتمالاً سند اسکن‌شده است و به OCR نیاز دارد؛ ' +
          'سرویس media-engine را فعال کنید یا نسخهٔ متنی سند را آپلود کنید.',
      );
    }

    const pages = removeRepeatedHeaders(extraction.pages);
    const chunks = chunkPages(pages);

    if (chunks.length === 0) {
      throw new Error('محتوای قابل ایندکسی در این سند پیدا نشد.');
    }

    // ایندکس مجدد: قطعات قبلی پاک می‌شوند تا نسخهٔ تکراری نماند (F3.7).
    await prisma.documentChunk.deleteMany({ where: { documentId } });

    const created = await prisma.$transaction(
      chunks.map((chunk) =>
        prisma.documentChunk.create({
          data: {
            documentId,
            content: chunk.content,
            page: chunk.page,
            section: chunk.section,
            ordinal: chunk.ordinal,
            tokenCount: chunk.tokenCount,
          },
          select: { id: true, content: true },
        }),
      ),
    );

    const embedder = createEmbeddingProvider();

    for (let start = 0; start < created.length; start += EMBEDDING_BATCH) {
      const batch = created.slice(start, start + EMBEDDING_BATCH);
      const vectors = await embedder.embed(
        batch.map((row) => row.content),
        'document',
      );

      if (vectors.length !== batch.length) {
        throw new Error('تعداد بردارهای بازگشتی با تعداد قطعات یکی نیست.');
      }

      await setChunkEmbeddings(
        batch.map((row, index) => ({ chunkId: row.id, vector: vectors[index]! })),
      );
    }

    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'indexed',
        chunkCount: created.length,
        pageCount: extraction.pageCount,
        indexedAt: new Date(),
        errorMessage: null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'خطای ناشناخته در ایندکس کردن سند.';

    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'error', errorMessage: message.slice(0, 500) },
    });

    await logServiceError('rag', `ایندکس سند ${documentId} شکست خورد`, message);
  }
}

/**
 * اجرای ایندکس بدون معطل کردن پاسخ HTTP.
 *
 * توجه: این کار در همان فرآیند Next.js انجام می‌شود. اگر حجم اسناد
 * زیاد شود، این نقطه جایی است که باید به یک صف واقعی (BullMQ روی
 * Redis) منتقل شود.
 */
export function scheduleIndexing(documentId: string): void {
  void indexDocument(documentId).catch(async (error: unknown) => {
    await logServiceError(
      'rag',
      `ایندکس ناهمگام سند ${documentId} شکست خورد`,
      error instanceof Error ? error.message : String(error),
    );
  });
}
