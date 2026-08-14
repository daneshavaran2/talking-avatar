'use client';

import { InfoIcon, Trash2Icon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { SectionCard } from '@/components/admin/ui';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

/**
 * سیاست نگهداری داده (§۱۱.۲ / P3).
 *
 * مدت نگهداری از `DATA_RETENTION_DAYS` خوانده می‌شود و اینجا فقط
 * نمایش داده می‌شود — تغییرش کار مدیر سیستم است، نه یک دکمه در
 * پنل، چون پیامد حقوقی دارد.
 */

type RetentionInfo = {
  retentionDays: number;
  cutoff: string;
  conversations: number;
  messages: number;
  serviceErrors: number;
};

export function RetentionPanel() {
  const [info, setInfo] = useState<RetentionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [pruning, setPruning] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/retention');
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? 'خواندن سیاست نگهداری ممکن نشد.');
        return;
      }
      setInfo((await response.json()) as RetentionInfo);
    } catch {
      toast.error('ارتباط با سرور برقرار نشد.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const prune = async () => {
    setPruning(true);
    try {
      const response = await fetch('/api/admin/retention', { method: 'POST' });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? 'پاک‌سازی ممکن نشد.');
        return;
      }

      const body = (await response.json()) as {
        deletedConversations: number;
        deletedServiceErrors: number;
      };
      toast.success(
        `${body.deletedConversations} مکالمه و ${body.deletedServiceErrors} لاگ خطا پاک شد.`,
      );
      setConfirming(false);
      await load();
    } catch {
      toast.error('ارتباط با سرور برقرار نشد.');
    } finally {
      setPruning(false);
    }
  };

  return (
    <SectionCard
      title="حریم خصوصی و نگهداری داده"
      description="مکالمات قدیمی‌تر از دورهٔ نگهداری پاک می‌شوند. اسناد، آواتار، صدا و سؤالات بی‌پاسخ دست‌نخورده می‌مانند."
    >
      {loading && !info ? (
        <Skeleton className="h-32 w-full" />
      ) : info ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-muted/40 p-3">
              <p className="text-[11px] text-muted-foreground">دورهٔ نگهداری</p>
              <p className="mt-1 text-lg font-semibold">
                <span className="latn">{info.retentionDays}</span>
                <span className="ms-1 text-xs font-normal text-muted-foreground">روز</span>
              </p>
            </div>
            <div className="rounded-xl border bg-muted/40 p-3">
              <p className="text-[11px] text-muted-foreground">مکالمات کاندید حذف</p>
              <p className="mt-1 text-lg font-semibold latn">{info.conversations}</p>
            </div>
            <div className="rounded-xl border bg-muted/40 p-3">
              <p className="text-[11px] text-muted-foreground">پیام‌های کاندید حذف</p>
              <p className="mt-1 text-lg font-semibold latn">{info.messages}</p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            مرز حذف: مکالمات شروع‌شده پیش از{' '}
            <span className="latn">{new Date(info.cutoff).toLocaleDateString('fa-IR')}</span>. برای
            تغییر دوره، متغیر <code className="latn">DATA_RETENTION_DAYS</code> را تنظیم کنید.
          </p>

          <Alert variant="info">
            <InfoIcon />
            <AlertDescription>
              برای اجرای خودکار، این دستور را در cron روزانه بگذارید:{' '}
              <code className="latn">npm run db:prune</code>. پاک‌سازی عمداً داخل اپلیکیشن
              زمان‌بندی نشده تا در استقرار چند-نمونه‌ای چند بار هم‌زمان اجرا نشود.
            </AlertDescription>
          </Alert>

          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-destructive">
                {info.conversations} مکالمه برای همیشه حذف می‌شود. مطمئنید؟
              </span>
              <Button variant="destructive" size="sm" onClick={() => void prune()} disabled={pruning}>
                {pruning && <Spinner />}
                بله، پاک کن
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                انصراف
              </Button>
            </div>
          ) : (
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirming(true)}
                disabled={info.conversations === 0 && info.serviceErrors === 0}
              >
                <Trash2Icon />
                اجرای پاک‌سازی همین حالا
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </SectionCard>
  );
}
