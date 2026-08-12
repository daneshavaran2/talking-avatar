/**
 * تشخیص مرز جمله برای الگوی Sentence Streaming (§F6.4).
 *
 * هدف: به‌محض کامل شدن هر جمله، همان جمله فوراً به TTS برود و
 * منتظر تکمیل کل پاسخ نمانیم. این تنها راه رسیدن به بودجهٔ تأخیر
 * زیر ۲ ثانیه است (§۱۰.۱).
 *
 * نکات فارسی:
 *  - علامت سؤال فارسی «؟» و ویرگول فارسی «،» جدا از نسخهٔ لاتین‌اند.
 *  - اعداد اعشاری («۳.۵») و مخفف‌ها نباید جمله را بشکنند.
 */

const TERMINATORS = new Set(['.', '!', '?', '؟', '!', '۔', '…']);

/** حداکثر طول یک قطعه پیش از اینکه بدون علامت پایانی هم بشکنیم. */
const MAX_PENDING_CHARS = 220;

/** حداقل طول یک جمله تا ارزش ارسال جداگانه به TTS را داشته باشد. */
const MIN_SENTENCE_CHARS = 2;

const PERSIAN_DIGITS = /[۰-۹٠-٩0-9]/;

export class SentenceSplitter {
  private buffer = '';

  /**
   * یک قطعه متن (توکن) را می‌گیرد و هر جملهٔ کاملی که تشکیل شده
   * را برمی‌گرداند. باقی‌ماندهٔ ناقص در بافر می‌ماند.
   */
  push(text: string): string[] {
    this.buffer += text;
    const sentences: string[] = [];

    let index = 0;
    while (index < this.buffer.length) {
      const char = this.buffer[index]!;

      if (TERMINATORS.has(char)) {
        // نقطه‌ای که بین دو رقم است، جداکنندهٔ اعشار است نه پایان جمله.
        if (char === '.' && this.isDecimalPoint(index)) {
          index += 1;
          continue;
        }

        // علائم پشت‌سرهم («؟!») را یکجا می‌گیریم.
        let end = index + 1;
        while (end < this.buffer.length && TERMINATORS.has(this.buffer[end]!)) end += 1;

        // نقل‌قول یا پرانتز بستهٔ بعد از علامت، بخشی از همان جمله است.
        while (end < this.buffer.length && /["»'”)\]]/.test(this.buffer[end]!)) end += 1;

        const candidate = this.buffer.slice(0, end).trim();
        if (candidate.length >= MIN_SENTENCE_CHARS) {
          sentences.push(candidate);
          this.buffer = this.buffer.slice(end);
          index = 0;
          continue;
        }
      }

      index += 1;
    }

    // اگر جمله‌ای بی‌اندازه طولانی شد، روی آخرین ویرگول یا فاصله
    // می‌شکنیم تا صدا شروع شود و کاربر منتظر نماند.
    if (this.buffer.length > MAX_PENDING_CHARS) {
      const forced = this.forceBreak();
      if (forced) sentences.push(forced);
    }

    return sentences;
  }

  /** باقی‌ماندهٔ بافر را در پایان جریان بیرون می‌دهد. */
  flush(): string | null {
    const remainder = this.buffer.trim();
    this.buffer = '';
    return remainder.length > 0 ? remainder : null;
  }

  /** پاک‌سازی کامل — هنگام Barge-In باید بافر دور ریخته شود. */
  reset(): void {
    this.buffer = '';
  }

  get pending(): string {
    return this.buffer;
  }

  private isDecimalPoint(index: number): boolean {
    const before = this.buffer[index - 1];
    const after = this.buffer[index + 1];
    return Boolean(before && after && PERSIAN_DIGITS.test(before) && PERSIAN_DIGITS.test(after));
  }

  private forceBreak(): string | null {
    const window = this.buffer.slice(0, MAX_PENDING_CHARS);
    const breakAt = Math.max(
      window.lastIndexOf('، '),
      window.lastIndexOf('؛ '),
      window.lastIndexOf(', '),
      window.lastIndexOf(' — '),
    );

    const cut = breakAt > 40 ? breakAt + 1 : window.lastIndexOf(' ');
    if (cut <= 0) return null;

    const piece = this.buffer.slice(0, cut).trim();
    this.buffer = this.buffer.slice(cut);
    return piece.length >= MIN_SENTENCE_CHARS ? piece : null;
  }
}
