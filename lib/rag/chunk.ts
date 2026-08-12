import { CHUNKING } from '@/lib/config/constants';
import { estimateTokens } from '@/lib/text/persian';
import type { ExtractedPage } from '@/lib/rag/extract';

/**
 * قطعه‌بندی (§F3).
 *
 * قواعد سند:
 *  - اندازه: ۵۰۰ تا ۸۰۰ توکن
 *  - همپوشانی: ۱۰۰ توکن
 *  - مرزها: ترجیحاً روی پاراگراف، نه وسط جمله
 *
 * چرا همپوشانی: اگر پاسخ یک سؤال دقیقاً روی مرز دو قطعه بیفتد،
 * بدون همپوشانی هیچ‌کدام از دو قطعه به‌تنهایی جواب کامل ندارند.
 */

export type Chunk = {
  content: string;
  page: number | null;
  section: string | null;
  ordinal: number;
  tokenCount: number;
};

type Block = { text: string; page: number; section: string | null };

export function chunkPages(pages: ExtractedPage[]): Chunk[] {
  const blocks = toBlocks(pages);
  const chunks: Chunk[] = [];

  let buffer: Block[] = [];
  let bufferTokens = 0;

  const flush = () => {
    if (buffer.length === 0) return;

    const content = buffer.map((b) => b.text).join('\n\n').trim();
    const tokenCount = estimateTokens(content);

    if (content.length > 0 && tokenCount >= CHUNKING.minTokens) {
      chunks.push({
        content,
        page: buffer[0]!.page,
        section: buffer[0]!.section,
        ordinal: chunks.length,
        tokenCount,
      });
    } else if (content.length > 0 && chunks.length > 0) {
      // بقایای کوچک را به قطعهٔ قبلی می‌چسبانیم تا قطعهٔ بی‌معنی نسازیم.
      const previous = chunks[chunks.length - 1]!;
      previous.content = `${previous.content}\n\n${content}`;
      previous.tokenCount = estimateTokens(previous.content);
    } else if (content.length > 0) {
      chunks.push({
        content,
        page: buffer[0]!.page,
        section: buffer[0]!.section,
        ordinal: chunks.length,
        tokenCount,
      });
    }

    // همپوشانی: آخرین بلوک‌ها را تا سقف overlapTokens نگه می‌داریم.
    buffer = takeOverlap(buffer);
    bufferTokens = buffer.reduce((sum, b) => sum + estimateTokens(b.text), 0);
  };

  for (const block of blocks) {
    const blockTokens = estimateTokens(block.text);

    // پاراگراف بلندتر از سقف: خودش را روی مرز جمله می‌شکنیم.
    if (blockTokens > CHUNKING.maxTokens) {
      flush();
      for (const piece of splitLongBlock(block)) {
        chunks.push({
          content: piece.text,
          page: piece.page,
          section: piece.section,
          ordinal: chunks.length,
          tokenCount: estimateTokens(piece.text),
        });
      }
      buffer = [];
      bufferTokens = 0;
      continue;
    }

    if (bufferTokens + blockTokens > CHUNKING.targetTokens && bufferTokens > 0) {
      flush();
    }

    buffer.push(block);
    bufferTokens += blockTokens;
  }

  // آخرین بافر: بدون همپوشانی بیرون داده می‌شود.
  if (buffer.length > 0) {
    const content = buffer.map((b) => b.text).join('\n\n').trim();
    if (content.length > 0) {
      const tokenCount = estimateTokens(content);
      if (tokenCount < CHUNKING.minTokens && chunks.length > 0) {
        const previous = chunks[chunks.length - 1]!;
        previous.content = `${previous.content}\n\n${content}`;
        previous.tokenCount = estimateTokens(previous.content);
      } else {
        chunks.push({
          content,
          page: buffer[0]!.page,
          section: buffer[0]!.section,
          ordinal: chunks.length,
          tokenCount,
        });
      }
    }
  }

  return chunks.map((chunk, index) => ({ ...chunk, ordinal: index }));
}

/** صفحات را به بلوک‌های پاراگرافی با عنوان بخش تبدیل می‌کند. */
function toBlocks(pages: ExtractedPage[]): Block[] {
  const blocks: Block[] = [];
  let currentSection: string | null = null;

  for (const page of pages) {
    for (const raw of page.text.split(/\n{2,}/)) {
      const text = raw.trim();
      if (!text) continue;

      if (isHeading(text)) {
        currentSection = text.slice(0, 120);
      }

      blocks.push({ text, page: page.page, section: currentSection });
    }
  }

  return blocks;
}

/**
 * تشخیص عنوان: خط کوتاه و تنها، بدون نقطهٔ پایانی.
 * دقیق نیست ولی برای فراداده کافی است و هزینه‌ای ندارد.
 */
function isHeading(text: string): boolean {
  if (text.includes('\n')) return false;
  if (text.length > 80) return false;
  return !/[.!?؟:]$/.test(text);
}

function takeOverlap(blocks: Block[]): Block[] {
  const kept: Block[] = [];
  let tokens = 0;

  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const block = blocks[i]!;
    const blockTokens = estimateTokens(block.text);
    if (tokens + blockTokens > CHUNKING.overlapTokens && kept.length > 0) break;
    kept.unshift(block);
    tokens += blockTokens;
    if (tokens >= CHUNKING.overlapTokens) break;
  }

  return kept;
}

/** پاراگراف خیلی بلند را روی مرز جمله می‌شکند، نه وسط کلمه. */
function splitLongBlock(block: Block): Block[] {
  const sentences = block.text.split(/(?<=[.!?؟])\s+/);
  const pieces: Block[] = [];

  let current = '';
  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (estimateTokens(candidate) > CHUNKING.targetTokens && current) {
      pieces.push({ text: current.trim(), page: block.page, section: block.section });
      current = sentence;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) {
    pieces.push({ text: current.trim(), page: block.page, section: block.section });
  }

  return pieces;
}
