/* بررسی دستی منطق هسته — اجرا با tsx */
import { SentenceSplitter } from '@/lib/conversation/sentence-splitter';
import {
  normalizePersian,
  normalizeForMatching,
  estimateTokens,
} from '@/lib/text/persian';
import { classifyTopic } from '@/lib/analytics/topics';
import { chunkPages } from '@/lib/rag/chunk';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`);
}

console.log('\n── SentenceSplitter ──────────────────────────');
{
  const s = new SentenceSplitter();
  check('split on Persian question mark', s.push('سلام. حالت چطوره؟ خوبم'), [
    'سلام.',
    'حالت چطوره؟',
  ]);
  check('remainder buffered', s.pending, ' خوبم');
  check('flush returns remainder', s.flush(), 'خوبم');
}
{
  const s = new SentenceSplitter();
  check('decimal not split', s.push('قیمت ۳.۵ میلیون تومان است.'), ['قیمت ۳.۵ میلیون تومان است.']);
}
{
  const s = new SentenceSplitter();
  check('token-by-token assembly', ['سلا', 'م د', 'نیا.'].flatMap((t) => s.push(t)), ['سلام دنیا.']);
}
{
  const s = new SentenceSplitter();
  const long = 'الف '.repeat(80); // ~۳۲۰ کاراکتر بدون علامت پایانی
  const out = s.push(long);
  check('force-breaks over-long text', out.length > 0, true);
}
{
  const s = new SentenceSplitter();
  check('closing quote stays with sentence', s.push('او گفت «سلام.» بعد رفت.'), [
    'او گفت «سلام.»',
    'بعد رفت.',
  ]);
}

console.log('\n── Persian normalisation ─────────────────────');
check('arabic yeh/kaf folded', normalizeForMatching('كتاب‌های يك نفر'), 'کتاب های یک نفر');
check('digits folded to latin', normalizeForMatching('سفارش ۱۲۳ و ٤٥٦'), 'سفارش 123 و 456');
check('punctuation stripped for matching', normalizeForMatching('قیمت؟ چند!'), 'قیمت چند');
check('display normalisation keeps ZWNJ', normalizePersian('كتاب‌هاي من').includes('‌'), true);
check('space before punctuation removed', normalizePersian('سلام ، خوبی'), 'سلام، خوبی');
check('token estimate', estimateTokens('سلام دنیا'), 3);

console.log('\n── Topic classification ──────────────────────');
check('pricing', classifyTopic('قیمت این محصول چند تومان است؟'), 'pricing');
check('orders', classifyTopic('سفارش من کی ارسال میشه؟'), 'orders');
check('support', classifyTopic('دستگاه خراب شده و کار نمیکنه'), 'support');
check('booking', classifyTopic('میخوام یک نوبت مشاوره رزرو کنم'), 'booking');
check('greeting short', classifyTopic('سلام'), 'greeting');
check('greeting prefix does not swallow real question', classifyTopic('سلام میخواستم بپرسم سفارش من کی ارسال میشود'), 'orders');
check('unknown falls back to other', classifyTopic('هوا امروز چطور است'), 'other');

console.log('\n── Chunking ──────────────────────────────────');
{
  const paragraph = 'این یک پاراگراف نمونه است که محتوای مشخصی دارد و برای آزمون قطعه‌بندی نوشته شده. '.repeat(12);
  const chunks = chunkPages([
    { page: 1, text: `عنوان بخش اول\n\n${paragraph}\n\n${paragraph}` },
    { page: 2, text: `عنوان بخش دوم\n\n${paragraph}` },
  ]);

  check('produced multiple chunks', chunks.length > 1, true);
  check('all chunks under max tokens', chunks.every((c) => c.tokenCount <= 900), true);
  check('page metadata preserved', chunks.some((c) => c.page === 2), true);
  check('section metadata captured', chunks.some((c) => c.section?.includes('عنوان')), true);
  check('ordinals sequential', chunks.map((c) => c.ordinal), chunks.map((_, i) => i));
  console.log(`      (${chunks.length} chunks, tokens: ${chunks.map((c) => c.tokenCount).join(', ')})`);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
