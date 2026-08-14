'use client';

import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * اجزای دامنه‌ای پنل مدیریت.
 * روی اجزای shadcn ساخته شده‌اند و فقط چیزی را اضافه می‌کنند که
 * مخصوص این محصول است: کارت آماری، نمودار درصدی، و برچسب وضعیت.
 */

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      {(title || action) && (
        <CardHeader className={cn(action && 'grid grid-cols-[1fr_auto] items-start')}>
          <div className="flex flex-col gap-1.5">
            {title && <CardTitle>{title}</CardTitle>}
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          {action && <CardAction>{action}</CardAction>}
        </CardHeader>
      )}
      <CardContent className={cn(!title && !action && 'pt-5')}>{children}</CardContent>
    </Card>
  );
}

export function StatCard({
  label,
  value,
  suffix,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  suffix?: string;
  hint?: string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
}) {
  const toneClass = {
    default: 'text-foreground',
    good: 'text-state-listening',
    warn: 'text-state-thinking',
    bad: 'text-state-error',
  }[tone];

  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('text-2xl font-semibold tabular-nums', toneClass)}>
          <span className="latn">{value}</span>
          {suffix && <span className="ms-1 text-sm font-normal text-muted-foreground">{suffix}</span>}
        </p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/** نمودار میله‌ای درصدی (§۱۰.۲). */
export function BarList({
  items,
  onSelect,
  selected,
  emptyText = 'داده‌ای در این بازه نیست.',
}: {
  items: Array<{ key: string; label: string; count: number; percent: number }>;
  onSelect?: (key: string) => void;
  selected?: string | null;
  emptyText?: string;
}) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-xs text-muted-foreground">{emptyText}</p>;
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => {
        const active = selected === item.key;
        const content = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span>{item.label}</span>
              <span className="tabular-nums text-muted-foreground latn">
                {item.percent}٪ ({item.count})
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-500',
                  active ? 'bg-primary' : 'bg-primary/70',
                )}
                style={{ width: `${Math.max(2, item.percent)}%` }}
              />
            </div>
          </>
        );

        return (
          <li key={item.key}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(item.key)}
                className={cn(
                  'w-full rounded-md p-1.5 text-start transition-colors hover:bg-muted/60',
                  active && 'bg-muted',
                )}
              >
                {content}
              </button>
            ) : (
              <div className="p-1.5">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const STATUS_MAP: Record<
  string,
  { label: string; variant: 'secondary' | 'success' | 'warning' | 'destructive' }
> = {
  pending: { label: 'در صف', variant: 'secondary' },
  processing: { label: 'در حال پردازش', variant: 'warning' },
  ready: { label: 'آماده', variant: 'success' },
  indexed: { label: 'ایندکس شد', variant: 'success' },
  error: { label: 'خطا', variant: 'destructive' },
};

export function StatusBadge({ status }: { status: string }) {
  const entry = STATUS_MAP[status] ?? { label: status, variant: 'secondary' as const };

  return (
    <Badge variant={entry.variant}>
      {status === 'processing' && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
      {entry.label}
    </Badge>
  );
}
