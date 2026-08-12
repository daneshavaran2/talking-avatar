'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ChartIcon,
  ChatIcon,
  DocumentIcon,
  FaceIcon,
  PlugIcon,
  ShieldIcon,
  SlidersIcon,
  SpeakerIcon,
} from '@/components/ui/icons';

const LINKS = [
  { href: '/admin', label: 'داشبورد', icon: ChartIcon },
  { href: '/admin/conversations', label: 'آرشیو مکالمات', icon: ChatIcon },
  { href: '/admin/avatar', label: 'چهرهٔ آواتار', icon: FaceIcon },
  { href: '/admin/voice', label: 'صدای آواتار', icon: SpeakerIcon },
  { href: '/admin/knowledge', label: 'پایگاه دانش', icon: DocumentIcon },
  { href: '/admin/behavior', label: 'رفتار و محدودیت‌ها', icon: ShieldIcon },
  { href: '/admin/tools', label: 'ابزارهای خارجی', icon: PlugIcon },
  { href: '/admin/settings', label: 'تنظیمات مدل', icon: SlidersIcon },
];

export function AdminNav({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
    router.push('/admin/login');
    router.refresh();
  };

  return (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:h-fit">
      <div className="panel p-4">
        <p className="text-sm font-semibold text-content">پنل مدیریت</p>
        <p className="mt-0.5 truncate text-[11px] text-content-faint" title={email}>
          {email}
        </p>
      </div>

      <nav className="panel overflow-hidden p-1.5">
        <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {LINKS.map((link) => {
            const active =
              link.href === '/admin' ? pathname === '/admin' : pathname.startsWith(link.href);
            const Icon = link.icon;

            return (
              <li key={link.href} className="shrink-0 lg:shrink">
                <Link
                  href={link.href}
                  className={clsx(
                    'flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm transition-colors',
                    active
                      ? 'bg-brand-wash text-brand-soft'
                      : 'text-content-muted hover:bg-surface-raised hover:text-content',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex gap-2">
        <Link href="/" target="_blank" className="btn-ghost flex-1 justify-center text-xs">
          نمای کاربر
        </Link>
        <button type="button" onClick={() => void logout()} className="btn-ghost text-xs">
          خروج
        </button>
      </div>
    </aside>
  );
}
