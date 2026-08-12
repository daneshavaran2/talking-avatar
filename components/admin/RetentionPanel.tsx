'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Card, Spinner } from '@/components/admin/ui';

/**
 * سیاست نگهداری داده (§۱۱.۲ / P3).
 *
 * مدت نگهداری از متغیر محیطی `DATA_RETENTION_DAYS` خوانده می‌شود و
 * اینجا فقط نمایش داده می‌شود — تغییرش کار مدیر سیستم است، نه یک
 * دکمه در پنل، چون پیامد حقوقی دارد.
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
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/retention');
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'خواندن سیاست نگهداری ممکن نشد.');
        return;
      }
      setInfo((await response.json()) as RetentionInfo);
      setError(null);
    } catch {
      setError('ارتباط با سرور برقرار نشد.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const prune = async () => {
    setPruning(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/admin/retention', { method: 'POST' });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'پاک‌سازی ممکن نشد.');
        return;
      }

      const body = (await response.json()) as {
        deletedConversations: number;
        deletedServiceErrors: number;
      };
      setResult(
        `${body.deletedConversations} مکالمه و ${body.deletedServiceErrors} لاگ خطا پاک شد.`,
      );
      setConfirming(false);
      await load();
    } catch {
      setError('ارتباط با سرور برقرار نشد.');
    } finally {
      setPruning(false);
    }
  };

  return (
    <Card
      title="حریم خصوصی و نگهداری داده"
      description="مکالمات قدیمی‌تر از دورهٔ نگهداری پاک می‌شوند. اسناد، آواتار، صدا و سؤالات بی‌پاسخ دست‌نخورده می‌مانند."
    >
      {loading && !info ? (
        <div className="flex justify-center py-6 text-content-faint">
          <Spinner className="h-5 w-5" />
        </div>
      ) : info ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-surface-sunken p-3">
              <p className="text-[11px] text-content-muted">دورهٔ نگهداری</p>
              <p className="mt-1 text-lg font-semibold text-content">
                <span className="latn">{info.retentionDays}</span>
                <span className="ms-1 text-xs font-normal text-content-faint">روز</span>
              </p>
            </div>
            <div className="rounded-xl bg-surface-sunken p-3">
              <p className="text-[11px] text-content-muted">مکالمات کاندید حذف</p>
              <p className="mt-1 text-lg font-semibold text-content latn">{info.conversations}</p>
            </div>
            <div className="rounded-xl bg-surface-sunken p-3">
              <p className="text-[11px] text-content-muted">پیام‌های کاندید حذف</p>
              <p className="mt-1 text-lg font-semibold text-content latn">{info.messages}</p>
            </div>
          </div>

          <p className="hint">
            مرز حذف: مکالمات شروع‌شده پیش از{' '}
            <span className="latn">{new Date(info.cutoff).toLocaleDateString('fa-IR')}</span>. برای
            تغییر دوره، متغیر <code className="latn">DATA_RETENTION_DAYS</code> را در محیط تنظیم
            کنید.
          </p>

          <Alert tone="info">
            برای اجرای خودکار، این دستور را در cron روزانه بگذارید:{' '}
            <code className="latn">npm run db:prune</code>. پاک‌سازی عمداً داخل اپلیکیشن زمان‌بندی
            نشده تا در استقرار چند-نمونه‌ای چند بار هم‌زمان اجرا نشود.
          </Alert>

          {error && <Alert tone="error">{error}</Alert>}
          {result && <Alert tone="success">{result}</Alert>}

          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-state-error">
                {info.conversations} مکالمه برای همیشه حذف می‌شود. مطمئنید؟
              </span>
              <button
                type="button"
                onClick={() => void prune()}
                disabled={pruning}
                className="btn-danger text-xs"
              >
                {pruning && <Spinner />}
                بله، پاک کن
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="btn-ghost text-xs"
              >
                انصراف
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={info.conversations === 0 && info.serviceErrors === 0}
              className="btn-ghost text-xs"
            >
              اجرای پاک‌سازی همین حالا
            </button>
          )}
        </div>
      ) : null}
    </Card>
  );
}
