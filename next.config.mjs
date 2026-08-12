/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // بارگذاری‌های سنگین (استخراج متن PDF/DOCX) فقط سمت سرور اجرا می‌شوند
  // و نباید وارد باندل کلاینت شوند.
  serverExternalPackages: ['unpdf', 'mammoth', '@prisma/client'],

  experimental: {
    // آپلود اسناد و نمونهٔ صدا از حد پیش‌فرض Server Action عبور می‌کند.
    serverActions: {
      bodySizeLimit: '30mb',
    },
  },

  eslint: {
    dirs: ['app', 'components', 'lib', 'prisma'],
  },
};

export default nextConfig;
