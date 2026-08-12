import type { ToolSchema } from '@/lib/ai/types';

/**
 * رجیستری ابزارها (§F9).
 *
 * هر ابزار یک Schema مشخص دارد (F9.1) که هم به مدل زبانی داده
 * می‌شود و هم برای اعتبارسنجی آرگومان‌ها استفاده می‌شود.
 *
 * `webhookPath` مسیر متناظر در n8n است؛ منطق کسب‌وکار آنجا پیاده
 * می‌شود، نه اینجا. n8n فقط برای اتوماسیون است — نه صدا، نه ویدئو،
 * نه Streaming (F9.2).
 */

export type ToolDefinition = ToolSchema & {
  /** برچسب فارسی برای نمایش در پنل مدیر */
  label: string;
  webhookPath: string;
  /** بیشینهٔ زمان انتظار؛ پیش‌فرض ۵ ثانیه (F9.5) */
  timeoutMs: number;
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'getProduct',
    label: 'دریافت اطلاعات محصول',
    description:
      'اطلاعات یک محصول مشخص را برمی‌گرداند: مشخصات فنی، توضیحات و وضعیت. ' +
      'وقتی استفاده کن که کاربر دربارهٔ جزئیات یک محصول مشخص می‌پرسد.',
    webhookPath: 'get-product',
    timeoutMs: 5000,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'نام یا کد محصول' },
      },
      required: ['query'],
    },
  },
  {
    name: 'getPrice',
    label: 'قیمت لحظه‌ای',
    description:
      'قیمت فعلی یک محصول را برمی‌گرداند. برای هر سؤالی دربارهٔ قیمت از این ابزار استفاده کن، ' +
      'چون قیمت‌ها در اسناد ممکن است قدیمی باشند.',
    webhookPath: 'get-price',
    timeoutMs: 5000,
    parameters: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'نام یا کد محصول' },
        quantity: { type: 'integer', description: 'تعداد درخواستی برای قیمت‌گذاری پلکانی' },
      },
      required: ['productId'],
    },
  },
  {
    name: 'getInventory',
    label: 'موجودی انبار',
    description: 'موجودی فعلی یک محصول در انبار را برمی‌گرداند.',
    webhookPath: 'get-inventory',
    timeoutMs: 5000,
    parameters: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'نام یا کد محصول' },
      },
      required: ['productId'],
    },
  },
  {
    name: 'getOrderStatus',
    label: 'وضعیت سفارش',
    description: 'وضعیت و کد رهگیری یک سفارش را با شمارهٔ سفارش برمی‌گرداند.',
    webhookPath: 'get-order-status',
    timeoutMs: 8000,
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'شمارهٔ سفارش' },
        phone: { type: 'string', description: 'شمارهٔ تماس ثبت‌شده روی سفارش، در صورت وجود' },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'createLead',
    label: 'ثبت سرنخ فروش',
    description:
      'اطلاعات تماس یک مشتری علاقه‌مند را در سیستم فروش ثبت می‌کند. ' +
      'فقط وقتی استفاده کن که کاربر خودش خواسته با او تماس گرفته شود.',
    webhookPath: 'create-lead',
    timeoutMs: 8000,
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'نام مشتری' },
        phone: { type: 'string', description: 'شمارهٔ تماس' },
        interest: { type: 'string', description: 'محصول یا خدمت مورد علاقه' },
      },
      required: ['name', 'phone'],
    },
  },
  {
    name: 'sendCatalog',
    label: 'ارسال کاتالوگ',
    description: 'کاتالوگ محصولات را به شمارهٔ تماس یا ایمیل کاربر ارسال می‌کند.',
    webhookPath: 'send-catalog',
    timeoutMs: 8000,
    parameters: {
      type: 'object',
      properties: {
        destination: { type: 'string', description: 'شمارهٔ تماس یا ایمیل مقصد' },
        category: { type: 'string', description: 'دستهٔ محصولات، در صورت مشخص بودن' },
      },
      required: ['destination'],
    },
  },
  {
    name: 'bookMeeting',
    label: 'رزرو جلسه',
    description: 'یک قرار ملاقات یا جلسهٔ مشاوره برای کاربر رزرو می‌کند.',
    webhookPath: 'book-meeting',
    timeoutMs: 10000,
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'نام کاربر' },
        phone: { type: 'string', description: 'شمارهٔ تماس' },
        preferredTime: { type: 'string', description: 'زمان پیشنهادی به بیان کاربر' },
        topic: { type: 'string', description: 'موضوع جلسه' },
      },
      required: ['name', 'phone', 'preferredTime'],
    },
  },
  {
    name: 'createSupportTicket',
    label: 'ثبت تیکت پشتیبانی',
    description: 'یک تیکت پشتیبانی برای مشکل کاربر ثبت می‌کند و شمارهٔ پیگیری برمی‌گرداند.',
    webhookPath: 'create-support-ticket',
    timeoutMs: 10000,
    parameters: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'عنوان کوتاه مشکل' },
        description: { type: 'string', description: 'شرح مشکل به بیان کاربر' },
        phone: { type: 'string', description: 'شمارهٔ تماس برای پیگیری' },
      },
      required: ['subject', 'description'],
    },
  },
];

export function findTool(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((tool) => tool.name === name);
}

/** فقط ابزارهایی که مدیر فعال کرده به مدل معرفی می‌شوند. */
export function enabledToolSchemas(enabledNames: string[]): ToolSchema[] {
  const enabled = new Set(enabledNames);
  return TOOL_DEFINITIONS.filter((tool) => enabled.has(tool.name)).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}
