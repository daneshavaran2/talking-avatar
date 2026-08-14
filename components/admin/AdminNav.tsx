'use client';

import {
  BarChart3Icon,
  FileTextIcon,
  MessagesSquareIcon,
  PlugIcon,
  ShieldIcon,
  SlidersHorizontalIcon,
  SmileIcon,
  Volume2Icon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/admin', label: 'داشبورد', icon: BarChart3Icon },
  { href: '/admin/conversations', label: 'آرشیو مکالمات', icon: MessagesSquareIcon },
  { href: '/admin/avatar', label: 'چهرهٔ آواتار', icon: SmileIcon },
  { href: '/admin/voice', label: 'صدای آواتار', icon: Volume2Icon },
  { href: '/admin/knowledge', label: 'پایگاه دانش', icon: FileTextIcon },
  { href: '/admin/behavior', label: 'رفتار و محدودیت‌ها', icon: ShieldIcon },
  { href: '/admin/tools', label: 'ابزارهای خارجی', icon: PlugIcon },
  { href: '/admin/settings', label: 'تنظیمات مدل', icon: SlidersHorizontalIcon },
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
      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-semibold">پنل مدیریت</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={email}>
            {email}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-1.5">
          <nav>
            <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
              {LINKS.map((link) => {
                const active =
                  link.href === '/admin' ? pathname === '/admin' : pathname.startsWith(link.href);
                const Icon = link.icon;

                return (
                  <li key={link.href} className="shrink-0 lg:shrink">
                    <Link
                      href={link.href}
                      className={cn(
                        'flex items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2.5 text-sm transition-colors',
                        active
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" asChild>
          <Link href="/" target="_blank">
            نمای کاربر
          </Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void logout()}>
          خروج
        </Button>
      </div>
    </aside>
  );
}
