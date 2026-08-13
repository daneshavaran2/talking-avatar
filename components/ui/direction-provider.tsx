'use client';

import { DirectionProvider as RadixDirectionProvider } from '@radix-ui/react-direction';

/**
 * جهت راست‌به‌چپ برای اجزای Radix.
 *
 * چرا لازم است: صفت `dir="rtl"` روی تگ html فقط چیدمان CSS را
 * برمی‌گرداند. اجزای Radix (Slider، Select، Tabs) جهت را از این
 * Context می‌خوانند، نه از DOM. بدون این Provider، لغزنده از چپ پر
 * می‌شود و کلیدهای جهت‌دار برعکس عمل می‌کنند.
 */
export function DirectionProvider({ children }: { children: React.ReactNode }) {
  return <RadixDirectionProvider dir="rtl">{children}</RadixDirectionProvider>;
}
