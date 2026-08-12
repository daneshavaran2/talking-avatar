import 'server-only';
import { normalizePersian } from '@/lib/text/persian';

/**
 * استخراج متن از اسناد آپلودشده (§F3).
 *
 * خروجی به‌صورت صفحه‌به‌صفحه است تا فراداده (شمارهٔ صفحه) برای
 * ارجاع‌دهی حفظ شود (F3.4). فایل‌های بدون مفهوم صفحه، یک «صفحه»
 * محسوب می‌شوند.
 */

export type ExtractedPage = {
  page: number;
  text: string;
};

export type ExtractionResult = {
  pages: ExtractedPage[];
  pageCount: number;
  /** آیا سند احتمالاً اسکن‌شده است (متن قابل استخراج نداشت)؟ */
  likelyScanned: boolean;
};

export type SupportedFileType = 'pdf' | 'docx' | 'txt' | 'md';

export function detectFileType(fileName: string, mimeType: string): SupportedFileType | null {
  const lower = fileName.toLowerCase();

  if (lower.endsWith('.pdf') || mimeType === 'application/pdf') return 'pdf';
  if (
    lower.endsWith('.docx') ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'docx';
  }
  if (lower.endsWith('.md') || lower.endsWith('.markdown') || mimeType === 'text/markdown') {
    return 'md';
  }
  if (lower.endsWith('.txt') || mimeType === 'text/plain') return 'txt';

  return null;
}

export async function extractDocument(
  data: Uint8Array,
  fileType: SupportedFileType,
): Promise<ExtractionResult> {
  switch (fileType) {
    case 'pdf':
      return extractPdf(data);
    case 'docx':
      return extractDocx(data);
    case 'md':
      return extractMarkdown(data);
    case 'txt':
      return extractPlainText(data);
  }
}

async function extractPdf(data: Uint8Array): Promise<ExtractionResult> {
  const { getDocumentProxy, extractText } = await import('unpdf');

  const pdf = await getDocumentProxy(data);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });

  const pages: ExtractedPage[] = (Array.isArray(text) ? text : [text]).map((raw, index) => ({
    page: index + 1,
    text: cleanExtractedText(raw ?? ''),
  }));

  const withContent = pages.filter((p) => p.text.length > 0);

  return {
    pages: withContent,
    pageCount: totalPages,
    // اگر تقریباً هیچ متنی استخراج نشد، سند اسکن‌شده است و به OCR
    // نیاز دارد (F3.2) — که در این نصب توسط سرویس GPU انجام می‌شود.
    likelyScanned: withContent.length === 0 || totalCharacters(withContent) < totalPages * 40,
  };
}

async function extractDocx(data: Uint8Array): Promise<ExtractionResult> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer: Buffer.from(data) });
  const text = cleanExtractedText(result.value);

  return {
    pages: text ? [{ page: 1, text }] : [],
    pageCount: 1,
    likelyScanned: false,
  };
}

async function extractMarkdown(data: Uint8Array): Promise<ExtractionResult> {
  const raw = new TextDecoder('utf-8').decode(data);

  // نشانه‌گذاری Markdown برای بازیابی معنایی نویز است؛ ساختار
  // عنوان‌ها را نگه می‌داریم ولی علائم را حذف می‌کنیم.
  const stripped = raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '• ')
    .replace(/[*_~]{1,3}/g, '');

  const text = cleanExtractedText(stripped);
  return { pages: text ? [{ page: 1, text }] : [], pageCount: 1, likelyScanned: false };
}

async function extractPlainText(data: Uint8Array): Promise<ExtractionResult> {
  const text = cleanExtractedText(new TextDecoder('utf-8').decode(data));
  return { pages: text ? [{ page: 1, text }] : [], pageCount: 1, likelyScanned: false };
}

function totalCharacters(pages: ExtractedPage[]): number {
  return pages.reduce((sum, page) => sum + page.text.length, 0);
}

/**
 * پاک‌سازی متن استخراج‌شده (§F3، مرحلهٔ «پاک‌سازی»).
 *
 * PDFها معمولاً کلمات را با شکست خط وسط جمله می‌شکنند و شمارهٔ
 * صفحه را داخل متن می‌گذارند؛ هر دو باید حذف شوند وگرنه قطعه‌بندی
 * و بازیابی خراب می‌شود.
 */
function cleanExtractedText(raw: string): string {
  let text = raw.replace(/\r\n?/g, '\n');

  // خط‌هایی که فقط شمارهٔ صفحه‌اند
  text = text.replace(/^\s*[-—–]?\s*[۰-۹0-9]{1,4}\s*[-—–]?\s*$/gm, '');

  // شکست خط وسط جمله را به فاصله تبدیل می‌کنیم، ولی پاراگراف
  // (دو خط خالی) را حفظ می‌کنیم.
  text = text.replace(/([^\n])\n(?!\n)([^\n])/g, '$1 $2');

  text = normalizePersian(text);

  return text.trim();
}

/**
 * حذف سرصفحه/پاصفحهٔ تکراری.
 *
 * روش: خطی که در بیش از نیمی از صفحات عیناً تکرار شده، تزئینی است.
 * فقط وقتی اعمال می‌شود که سند چند صفحه داشته باشد.
 */
export function removeRepeatedHeaders(pages: ExtractedPage[]): ExtractedPage[] {
  if (pages.length < 4) return pages;

  const counts = new Map<string, number>();
  for (const page of pages) {
    const lines = page.text.split('\n').map((l) => l.trim());
    const candidates = [...lines.slice(0, 2), ...lines.slice(-2)];
    for (const line of new Set(candidates)) {
      if (line.length < 3 || line.length > 120) continue;
      counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  }

  const threshold = Math.ceil(pages.length * 0.5);
  const repeated = new Set(
    [...counts.entries()].filter(([, count]) => count >= threshold).map(([line]) => line),
  );

  if (repeated.size === 0) return pages;

  return pages
    .map((page) => ({
      page: page.page,
      text: page.text
        .split('\n')
        .filter((line) => !repeated.has(line.trim()))
        .join('\n')
        .trim(),
    }))
    .filter((page) => page.text.length > 0);
}
