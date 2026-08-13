'use client';

import { InfoIcon, TrashIcon, TriangleAlertIcon, UploadIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { SectionCard, StatusBadge } from '@/components/admin/ui';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

/**
 * مدیریت چهرهٔ آواتار (§F1).
 *
 * وضعیت به‌صورت زنده Poll می‌شود چون پیش‌پردازش روی GPU ناهمگام
 * است و ممکن است تا یک دقیقه طول بکشد.
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
      toast.error('خواندن وضعیت آواتار ممکن نشد.');
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
    setWarning(null);

    try {
      const form = new FormData();
      form.append('image', file);

      const response = await fetch('/api/admin/avatar', { method: 'POST', body: form });
      const body = (await response.json().catch(() => null)) as
        | (AvatarResponse & { error?: string })
        | null;

      if (!response.ok) {
        toast.error(body?.error ?? 'آپلود عکس ممکن نشد.');
        return;
      }

      if (body?.warning) setWarning(body.warning);
      else toast.success('عکس آواتار ذخیره شد.');
      await load();
    } catch {
      toast.error('آپلود عکس ممکن نشد.');
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
    toast.success('آواتار حذف شد.');
  };

  const profile = data?.profile ?? null;

  return (
    <SectionCard
      title="چهرهٔ آواتار"
      description="یک عکس با چهرهٔ واضح و روبه‌رو آپلود کنید. عکس یک‌بار پردازش و نتیجه Cache می‌شود."
      action={
        profile ? (
          <Button variant="ghost" size="sm" onClick={() => void remove()} disabled={busy}>
            <TrashIcon />
            حذف
          </Button>
        ) : null
      }
    >
      <div className="grid gap-5 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl border bg-muted">
          {profile?.idleLoopUrl ? (
            <video src={profile.idleLoopUrl} className="size-full object-cover" muted loop autoPlay playsInline />
          ) : profile?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.imageUrl} alt="پیش‌نمایش آواتار" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center px-4 text-center text-[11px] text-muted-foreground">
              هنوز عکسی آپلود نشده
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {profile && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <StatusBadge status={profile.status} />
              {profile.width && profile.height && (
                <span className="text-muted-foreground latn">
                  {profile.width}×{profile.height}
                </span>
              )}
            </div>
          )}

          {profile?.errorMessage && (
            <Alert variant="warning">
              <TriangleAlertIcon />
              <AlertDescription>{profile.errorMessage}</AlertDescription>
            </Alert>
          )}

          {warning && (
            <Alert variant="warning">
              <TriangleAlertIcon />
              <AlertDescription>{warning}</AlertDescription>
            </Alert>
          )}

          {data && !data.realtimeAvailable && (
            <Alert variant="info">
              <InfoIcon />
              <AlertDescription>
                موتور تولیدی GPU پیکربندی نشده است. لیپ‌سینک بلادرنگ از روی صدا در مرورگر اجرا
                می‌شود؛ برای تنظیم جای دهان به بخش کالیبراسیون پایین بروید.
              </AlertDescription>
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
            <Button asChild disabled={busy}>
              <label htmlFor="avatar-file" className="cursor-pointer">
                {busy ? <Spinner /> : <UploadIcon />}
                {profile ? 'جایگزینی عکس' : 'آپلود عکس'}
              </label>
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">JPG، PNG یا WebP تا ۱۰ مگابایت</p>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">راهنمای عکس مناسب</p>
            <ul className="flex flex-col gap-1">
              {PHOTO_GUIDE.map((line) => (
                <li key={line} className="flex gap-1.5 text-xs text-muted-foreground">
                  <span className="text-primary">•</span>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
