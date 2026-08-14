'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * یادآور راه‌اندازی.
 * تا وقتی مدیر Setup Wizard را تمام نکرده نمایش داده می‌شود.
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
    <Card className="mb-5 border-primary/35 bg-accent">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-medium text-accent-foreground">
            راه‌اندازی هنوز کامل نشده است
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            چهار مرحله تا آواتار فعال: چهره، صدا، پایگاه دانش، و رفتار.
          </p>
        </div>
        <Button size="sm" asChild>
          <Link href="/admin/setup">ادامهٔ راه‌اندازی</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
