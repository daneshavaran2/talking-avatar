import type { Metadata, Viewport } from 'next';

import { DirectionProvider } from '@/components/ui/direction-provider';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'دستیار دیجیتال',
  description: 'انسان دیجیتال فارسی‌زبان — پاسخ‌گویی زنده با صدا و تصویر',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0B0F14',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `dark` پیش‌فرض است: تجربهٔ آواتار در پس‌زمینهٔ تیره خواناتر و
    // کم‌آزارتر است، به‌ویژه در نصب کیوسکی. پالت روشن هم کامل تعریف
    // شده و با برداشتن این کلاس فعال می‌شود.
    <html lang="fa" dir="rtl" className="dark">
      <body className="min-h-dvh bg-background">
        <DirectionProvider>{children}</DirectionProvider>
        <Toaster />
      </body>
    </html>
  );
}
