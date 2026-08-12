'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { Alert, Spinner } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'ورود ممکن نشد.');
        return;
      }

      const next = searchParams.get('next') ?? '/admin';
      router.push(next.startsWith('/admin') ? next : '/admin');
      router.refresh();
    } catch {
      setError('ارتباط با سرور برقرار نشد.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={submit} className="panel w-full max-w-sm p-6">
        <h1 className="text-base font-semibold text-content">ورود به پنل مدیریت</h1>
        <p className="mt-1 hint">دستیار دیجیتال فارسی</p>

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="label">
              ایمیل
            </label>
            <input
              id="email"
              type="email"
              dir="ltr"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="field text-start"
            />
          </div>

          <div>
            <label htmlFor="password" className="label">
              رمز عبور
            </label>
            <input
              id="password"
              type="password"
              dir="ltr"
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="field text-start"
            />
          </div>

          {error && <Alert tone="error">{error}</Alert>}

          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? <Spinner /> : null}
            ورود
          </button>
        </div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
