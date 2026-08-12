import type { Metadata, Viewport } from 'next';
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
    <html lang="fa" dir="rtl">
      <body className="min-h-dvh bg-ink">{children}</body>
    </html>
  );
}
