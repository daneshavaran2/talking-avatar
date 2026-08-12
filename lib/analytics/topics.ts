import { normalizeForMatching } from '@/lib/text/persian';
import type { Topic } from '@/lib/config/constants';

/**
 * دسته‌بندی موضوعی — رویکرد کلیدواژه‌ای، فاز اول (§۱۰.۲).
 *
 * تصمیم آگاهانه: سند توصیه می‌کند با کلیدواژه شروع کنیم و پس از
 * جمع شدن حداقل ۵۰۰ مکالمهٔ واقعی به خوشه‌بندی معنایی مهاجرت کنیم —
 * چون آن‌وقت داده کافی برای ارزیابی دقت وجود دارد.
 *
 * وزن‌دهی: هر تطبیق امتیاز می‌گیرد؛ دسته‌ای که بیشترین امتیاز را
 * بگیرد برنده است. عبارت‌های چندکلمه‌ای امتیاز بیشتری دارند چون
 * دقیق‌ترند.
 */

const TOPIC_KEYWORDS: Record<Exclude<Topic, 'other'>, string[]> = {
  pricing: [
    'قیمت',
    'چند',
    'هزینه',
    'تخفیف',
    'گران',
    'ارزان',
    'پرداخت',
    'اقساط',
    'فاکتور',
    'تومان',
    'ریال',
    'نرخ',
  ],
  products: [
    'محصول',
    'مدل',
    'مشخصات',
    'ویژگی',
    'کاتالوگ',
    'موجود',
    'رنگ',
    'سایز',
    'جنس',
    'گارانتی',
    'کیفیت',
    'تفاوت',
  ],
  orders: [
    'سفارش',
    'ارسال',
    'پست',
    'تحویل',
    'رهگیری',
    'مرجوع',
    'بسته',
    'کی میرسه',
    'کی می رسد',
    'باربری',
  ],
  support: [
    'مشکل',
    'خراب',
    'کار نمیکنه',
    'کار نمی کند',
    'نصب',
    'راه اندازی',
    'تعمیر',
    'پشتیبانی',
    'خطا',
    'ارور',
    'راهنمای استفاده',
  ],
  booking: ['وقت', 'نوبت', 'رزرو', 'قرار', 'جلسه', 'مشاوره', 'ملاقات', 'حضوری'],
  complaint: ['شکایت', 'ناراضی', 'بد بود', 'افتضاح', 'اعتراض', 'بازخورد', 'پیشنهاد میدم', 'گله'],
  greeting: ['سلام', 'درود', 'خداحافظ', 'ممنون', 'مرسی', 'سپاس', 'چطوری', 'خوبی'],
};

export function classifyTopic(text: string): Topic {
  const normalized = normalizeForMatching(text);
  if (!normalized) return 'other';

  let best: Topic = 'other';
  let bestScore = 0;

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    let score = 0;

    for (const keyword of keywords) {
      const needle = normalizeForMatching(keyword);
      if (!needle || !normalized.includes(needle)) continue;
      // عبارت چندکلمه‌ای نشانهٔ قوی‌تری است تا یک کلمهٔ تنها.
      score += needle.includes(' ') ? 3 : 1;
    }

    if (score > bestScore) {
      bestScore = score;
      best = topic as Topic;
    }
  }

  // «سلام» در ابتدای یک سؤال واقعی نباید کل پیام را احوال‌پرسی کند.
  if (best === 'greeting' && normalized.split(' ').length > 6) {
    return 'other';
  }

  return bestScore > 0 ? best : 'other';
}

/** دستهٔ غالب یک مکالمه از روی پیام‌های کاربر. */
export function dominantTopic(topics: Array<string | null>): Topic {
  const counts = new Map<string, number>();

  for (const topic of topics) {
    if (!topic || topic === 'other' || topic === 'greeting') continue;
    counts.set(topic, (counts.get(topic) ?? 0) + 1);
  }

  let best: Topic = 'other';
  let bestCount = 0;
  for (const [topic, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = topic as Topic;
    }
  }

  return best;
}
