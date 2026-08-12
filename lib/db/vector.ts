import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { env } from '@/lib/config/env';

/**
 * دسترسی به ستون‌های pgvector.
 *
 * Prisma نوع `vector` را نمی‌شناسد (در Schema به‌صورت Unsupported
 * تعریف شده)، بنابراین درج و جستجوی برداری با SQL خام انجام می‌شود.
 * تمام مقادیر پارامتری ارسال می‌شوند؛ هیچ رشته‌ای مستقیم به SQL
 * الحاق نمی‌شود.
 */

export type ChunkMatch = {
  id: string;
  documentId: string;
  content: string;
  page: number | null;
  section: string | null;
  documentTitle: string;
  /** شباهت کسینوسی در بازهٔ ۰ تا ۱ (۱ = یکسان) */
  similarity: number;
};

/** بردار عددی را به قالب متنی pgvector تبدیل می‌کند: `[0.1,0.2,...]` */
function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

function assertDimension(vector: number[]): void {
  const expected = env.embeddingDim;
  if (vector.length !== expected) {
    throw new Error(
      `ابعاد بردار (${vector.length}) با ابعاد پیکربندی‌شده (${expected}) یکی نیست. ` +
        `مدل EMBEDDING_MODEL را تغییر دهید یا EMBEDDING_DIM و مهاجرت پایگاه داده را هماهنگ کنید.`,
    );
  }
}

/** ذخیرهٔ بردار یک قطعه. قطعه باید از قبل ساخته شده باشد. */
export async function setChunkEmbedding(chunkId: string, vector: number[]): Promise<void> {
  assertDimension(vector);
  await prisma.$executeRaw`
    UPDATE "DocumentChunk"
    SET "embedding" = ${toVectorLiteral(vector)}::vector
    WHERE "id" = ${chunkId}
  `;
}

/** ذخیرهٔ گروهی بردارها در یک تراکنش — برای ایندکس کردن اسناد بزرگ. */
export async function setChunkEmbeddings(
  entries: Array<{ chunkId: string; vector: number[] }>,
): Promise<void> {
  if (entries.length === 0) return;
  for (const entry of entries) assertDimension(entry.vector);

  await prisma.$transaction(
    entries.map(
      (entry) => prisma.$executeRaw`
        UPDATE "DocumentChunk"
        SET "embedding" = ${toVectorLiteral(entry.vector)}::vector
        WHERE "id" = ${entry.chunkId}
      `,
    ),
  );
}

/**
 * جستجوی شباهت.
 *
 * `<=>` در pgvector فاصلهٔ کسینوسی است (۰ = یکسان)، پس شباهت را
 * به‌صورت `1 - distance` برمی‌گردانیم تا با آستانهٔ تنظیمات (که
 * بالاتر یعنی سخت‌گیرانه‌تر) هم‌جهت باشد.
 */
export async function searchSimilarChunks(
  queryVector: number[],
  topK: number,
  documentIds?: string[],
): Promise<ChunkMatch[]> {
  assertDimension(queryVector);

  const literal = toVectorLiteral(queryVector);
  const limit = Math.max(1, Math.min(50, Math.trunc(topK)));

  const filter =
    documentIds && documentIds.length > 0
      ? Prisma.sql`AND c."documentId" IN (${Prisma.join(documentIds)})`
      : Prisma.empty;

  return prisma.$queryRaw<ChunkMatch[]>`
    SELECT
      c."id"            AS "id",
      c."documentId"    AS "documentId",
      c."content"       AS "content",
      c."page"          AS "page",
      c."section"       AS "section",
      d."title"         AS "documentTitle",
      1 - (c."embedding" <=> ${literal}::vector) AS "similarity"
    FROM "DocumentChunk" c
    JOIN "Document" d ON d."id" = c."documentId"
    WHERE c."embedding" IS NOT NULL
      AND d."status" = 'indexed'
      ${filter}
    ORDER BY c."embedding" <=> ${literal}::vector
    LIMIT ${limit}
  `;
}

/** تعداد قطعاتی که بردارشان ساخته شده — برای نمایش وضعیت به مدیر. */
export async function countEmbeddedChunks(documentId?: string): Promise<number> {
  const rows = documentId
    ? await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM "DocumentChunk"
        WHERE "embedding" IS NOT NULL AND "documentId" = ${documentId}
      `
    : await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM "DocumentChunk" WHERE "embedding" IS NOT NULL
      `;

  return Number(rows[0]?.count ?? 0);
}
