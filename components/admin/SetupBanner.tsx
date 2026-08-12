'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * یادآور راه‌اندازی.
 *
 * تا وقتی مدیر Setup Wizard را تمام نکرده، در بالای پنل نمایش داده
 * می‌شود. هدف G1: مسیر «صفر تا آواتار فعال» نباید گم شود.
 */
export function SetupBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void fetch('/api/admin/settings')
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { settings?: { setupCompleted?: boolean } } | null) => {
        if (!cancelled && body?.settings) setShow(!body.settings.setupCompleted);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/35 bg-brand-wash p-4">
      <div>
        <p className="text-sm font-medium text-brand-soft">راه‌اندازی هنوز کامل نشده است</p>
        <p className="mt-0.5 hint">
          چهار مرحله تا آواتار فعال: چهره، صدا، پایگاه دانش، و رفتار.
        </p>
      </div>
      <Link href="/admin/setup" className="btn-primary shrink-0 text-xs">
        ادامهٔ راه‌اندازی
      </Link>
    </div>
  );
}
