/**
 * برچسب فارسی ابزارها برای نمایش در رابط کاربری.
 *
 * جدا از `registry.ts` نگه داشته شده چون آن فایل `server-only`
 * نیست ولی به Schemaهای سنگین وابسته است؛ کلاینت فقط به نام‌ها
 * نیاز دارد.
 */
export const TOOL_LABEL_BY_NAME: Record<string, string> = {
  getProduct: 'اطلاعات محصول',
  getPrice: 'قیمت لحظه‌ای',
  getInventory: 'موجودی انبار',
  getOrderStatus: 'وضعیت سفارش',
  createLead: 'ثبت سرنخ فروش',
  sendCatalog: 'ارسال کاتالوگ',
  bookMeeting: 'رزرو جلسه',
  createSupportTicket: 'تیکت پشتیبانی',
};
