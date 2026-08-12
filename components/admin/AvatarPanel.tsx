'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Card, Spinner, StatusBadge } from '@/components/admin/ui';
import { TrashIcon } from '@/components/ui/icons';

/**
 * مدیریت چهرهٔ آواتار (§F1).
 *
 * وضعیت به‌صورت زنده Poll می‌شود چون پیش‌پردازش روی GPU ناهمگام
 * است و ممکن است تا یک دقیقه طول بکشد (معیار پذیرش F1).
 */

type AvatarProfile = {
  id: string;
  imageUrl: string;
  status: string;
  errorMessage: string | null;
  idleLoopUrl: string | null;
  width: number | null;
  height: number | null;
};

type AvatarResponse = {
  profile: AvatarProfile | null;
  realtimeAvailable: boolean;
  warning?: string;
};

const PHOTO_GUIDE = [
  'چهره روبه‌رو، نگاه به دوربین',
  'نور یکنواخت، بدون سایهٔ شدید',
  'بدون عینک آفتابی یا پوشش صورت',
  'رزولوشن حداقل ۵۱۲×۵۱۲',
  'پس‌زمینهٔ ساده ترجیح داده می‌شود',
];

export function AvatarPanel({ onReady }: { onReady?: (ready: boolean) => void } = {}) {
  const [data, setData] = useState<AvatarResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/avatar');
      if (!response.ok) return;
      const body = (await response.json()) as AvatarResponse;
      setData(body);
      onReady?.(body.profile?.status === 'ready');
    } catch {
      setError('خواندن وضعیت آواتار ممکن نشد.');
    }
  }, [onReady]);

  useEffect(() => {
    void load();
  }, [load]);

  // تا وقتی پردازش ادامه دارد، وضعیت را زنده به‌روز نگه می‌داریم.
  useEffect(() => {
    if (data?.profile?.status !== 'processing') return;
    const timer = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(timer);
  }, [data?.profile?.status, load]);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    setWarning(null);

    try {
      const form = new FormData();
      form.append('image', file);

      const response = await fetch('/api/admin/avatar', { method: 'POST', body: form });
      const body = (await response.json().catch(() => null)) as
        | (AvatarResponse & { error?: string })
        | null;

      if (!response.ok) {
        setError(body?.error ?? 'آپلود عکس ممکن نشد.');
        return;
      }

      if (body?.warning) setWarning(body.warning);
      await load();
    } catch {
      setError('آپلود عکس ممکن نشد.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async () => {
    setBusy(true);
    await fetch('/api/admin/avatar', { method: 'DELETE' }).catch(() => {});
    setBusy(false);
    setData(null);
    await load();
  };

  const profile = data?.profile ?? null;

  return (
    <Card
      title="چهرهٔ آواتار"
      description="یک عکس با چهرهٔ واضح و روبه‌رو آپلود کنید. عکس یک‌بار پردازش و نتیجه Cache می‌شود."
      action={
        profile ? (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="btn-danger h-8 px-2.5 text-xs"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            حذف
          </button>
        ) : null
      }
    >
      <div className="grid gap-5 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-line bg-surface-sunken">
          {profile?.idleLoopUrl ? (
            <video
              src={profile.idleLoopUrl}
              className="h-full w-full object-cover"
              muted
              loop
              autoPlay
              playsInline
            />
          ) : profile?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.imageUrl} alt="پیش‌نمایش آواتار" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-center text-[11px] text-content-faint">
              هنوز عکسی آپلود نشده
            </div>
          )}
        </div>

        <div className="space-y-3">
          {profile && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <StatusBadge status={profile.status} />
              {profile.width && profile.height && (
                <span className="text-content-faint latn">
                  {profile.width}×{profile.height}
                </span>
              )}
              {profile.idleLoopUrl && (
                <span className="text-content-faint">حلقهٔ Idle آماده است</span>
              )}
            </div>
          )}

          {profile?.errorMessage && <Alert tone="warn">{profile.errorMessage}</Alert>}
          {warning && <Alert tone="warn">{warning}</Alert>}
          {error && <Alert tone="error">{error}</Alert>}

          {data && !data.realtimeAvailable && (
            <Alert tone="info">
              موتور آواتار بلادرنگ (media-engine) پیکربندی نشده است. عکس ذخیره می‌شود و به‌صورت
              تصویر ثابت نمایش داده خواهد شد؛ هماهنگی لب انجام نمی‌شود.
            </Alert>
          )}

          <div>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
              className="hidden"
              id="avatar-file"
            />
            <label htmlFor="avatar-file" className="btn-primary cursor-pointer">
              {busy && <Spinner />}
              {profile ? 'جایگزینی عکس' : 'آپلود عکس'}
            </label>
            <p className="mt-2 hint">JPG، PNG یا WebP تا ۱۰ مگابایت</p>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-content-muted">راهنمای عکس مناسب</p>
            <ul className="space-y-1">
              {PHOTO_GUIDE.map((line) => (
                <li key={line} className="flex gap-1.5 hint">
                  <span className="text-brand">•</span>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Card>
  );
}
