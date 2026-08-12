'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Card, Spinner, StatusBadge } from '@/components/admin/ui';

/**
 * مدیریت صدای آواتار (§F2).
 *
 * چک‌باکس رضایت اجباری است (§۱۱.۳): بدون آن دکمهٔ آپلود غیرفعال
 * می‌ماند و سرور هم درخواست را رد می‌کند. تأیید با زمان، شناسهٔ
 * کاربر و IP ثبت می‌شود.
 */

type VoiceProfile = {
  id: string;
  status: string;
  errorMessage?: string | null;
  providerName: string;
  consentConfirmed: boolean;
  consentAt: string | null;
};

const AUDIO_GUIDE = [
  'محیط ساکت، بدون اکو',
  'صحبت طبیعی و پیوسته (نه خواندن مصنوعی)',
  'بدون موسیقی پس‌زمینه',
  'ترجیحاً یک فایل پیوسته، نه چند تکهٔ به‌هم چسبیده',
];

const CONSENT_TEXT =
  'تأیید می‌کنم که صاحب این صدا هستم یا رضایت کتبی صاحب صدا را برای استفاده در این سیستم دریافت کرده‌ام.';

export function VoicePanel({ onReady }: { onReady?: (ready: boolean) => void } = {}) {
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [ttsConfigured, setTtsConfigured] = useState(true);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testText, setTestText] = useState('سلام، من دستیار دیجیتال شما هستم. چطور می‌توانم کمکتان کنم؟');
  const [testing, setTesting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/voice');
      if (!response.ok) return;
      const body = (await response.json()) as {
        profile: VoiceProfile | null;
        ttsConfigured: boolean;
      };
      setProfile(body.profile);
      setTtsConfigured(body.ttsConfigured);
      onReady?.(body.profile?.status === 'ready');
    } catch {
      setError('خواندن وضعیت صدا ممکن نشد.');
    }
  }, [onReady]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);

    try {
      const form = new FormData();
      form.append('audio', file);
      form.append('consent', 'true');

      const response = await fetch('/api/admin/voice', { method: 'POST', body: form });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'ساخت صدای اختصاصی ممکن نشد.');
        return;
      }

      await load();
    } catch {
      setError('آپلود نمونهٔ صدا ممکن نشد.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const runTest = async () => {
    setTesting(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/voice/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: testText }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'پخش صدای تستی ممکن نشد.');
        return;
      }

      const blob = await response.blob();
      audioRef.current?.pause();
      const audio = new Audio(URL.createObjectURL(blob));
      audioRef.current = audio;
      await audio.play();
    } catch {
      setError('پخش صدای تستی ممکن نشد.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card
      title="صدای آواتار"
      description="یک نمونهٔ صوتی آپلود کنید تا صدای اختصاصی ساخته شود. این کار فقط یک‌بار انجام می‌شود و نتیجه Cache می‌شود."
    >
      <div className="space-y-4">
        {!ttsConfigured && (
          <Alert tone="warn">
            سرویس تبدیل متن به صدا پیکربندی نشده است. ابتدا <code className="latn">TTS_PROVIDER</code>{' '}
            و کلید آن را در متغیرهای محیطی تنظیم کنید؛ تا آن زمان پاسخ‌ها فقط متنی خواهند بود.
          </Alert>
        )}

        {profile && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <StatusBadge status={profile.status} />
            <span className="text-content-faint latn">{profile.providerName}</span>
            {profile.consentAt && (
              <span className="text-content-faint">
                رضایت ثبت‌شده در {new Date(profile.consentAt).toLocaleDateString('fa-IR')}
              </span>
            )}
          </div>
        )}

        {profile?.errorMessage && <Alert tone="error">{profile.errorMessage}</Alert>}
        {error && <Alert tone="error">{error}</Alert>}

        <Alert tone="warn">
          کلون کردن صدای دیگری بدون اجازهٔ او در بسیاری از کشورها غیرقانونی است و مسئولیت حقوقی
          ایجاد می‌کند. تأیید شما با زمان، شناسهٔ کاربری و آدرس IP ثبت می‌شود.
        </Alert>

        <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-content">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[#E3A857]"
          />
          {CONSENT_TEXT}
        </label>

        <div>
          <input
            ref={inputRef}
            type="file"
            accept="audio/wav,audio/mpeg,audio/mp4,audio/x-m4a"
            disabled={busy || !consent || !ttsConfigured}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
            className="hidden"
            id="voice-file"
          />
          <label
            htmlFor="voice-file"
            className={
              consent && ttsConfigured && !busy
                ? 'btn-primary cursor-pointer'
                : 'btn-primary pointer-events-none opacity-45'
            }
          >
            {busy && <Spinner />}
            {profile ? 'آپلود نمونهٔ بهتر' : 'آپلود نمونهٔ صدا'}
          </label>
          <p className="mt-2 hint">WAV، MP3 یا M4A تا ۲۵ مگابایت — حداقل ۳۰ ثانیه (توصیه: ۶۰ تا ۱۲۰ ثانیه)</p>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-content-muted">راهنمای نمونهٔ مناسب</p>
          <ul className="space-y-1">
            {AUDIO_GUIDE.map((line) => (
              <li key={line} className="flex gap-1.5 hint">
                <span className="text-brand">•</span>
                {line}
              </li>
            ))}
          </ul>
        </div>

        {profile?.status === 'ready' && (
          <div className="rounded-xl border border-line bg-surface-sunken p-3">
            <label htmlFor="voice-test" className="label">
              تست صدا
            </label>
            <div className="flex gap-2">
              <input
                id="voice-test"
                value={testText}
                onChange={(event) => setTestText(event.target.value)}
                maxLength={300}
                className="field flex-1"
              />
              <button
                type="button"
                onClick={() => void runTest()}
                disabled={testing || !testText.trim()}
                className="btn-ghost shrink-0"
              >
                {testing ? <Spinner /> : null}
                پخش
              </button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
