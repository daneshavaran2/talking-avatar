'use client';

import clsx from 'clsx';
import type { ReactNode } from 'react';
import { AlertIcon, CheckIcon } from '@/components/ui/icons';

/** اجزای مشترک پنل مدیریت. */

export function Card({
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
    <section className={clsx('panel p-5', className)}>
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-content">{title}</h2>}
            {description && <p className="mt-1 hint">{description}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
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
    default: 'text-content',
    good: 'text-state-listening',
    warn: 'text-state-thinking',
    bad: 'text-state-error',
  }[tone];

  return (
    <div className="panel p-4">
      <p className="text-xs text-content-muted">{label}</p>
      <p className={clsx('mt-2 text-2xl font-semibold tabular-nums', toneClass)}>
        <span className="latn">{value}</span>
        {suffix && <span className="ms-1 text-sm font-normal text-content-faint">{suffix}</span>}
      </p>
      {hint && <p className="mt-1 text-[11px] text-content-faint">{hint}</p>}
    </div>
  );
}

/** نمودار میله‌ای درصدی (§۱۰.۲) — بدون کتابخانهٔ نمودار. */
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
    return <p className="hint py-6 text-center">{emptyText}</p>;
  }

  return (
    <ul className="space-y-2.5">
      {items.map((item) => {
        const active = selected === item.key;
        const Row = onSelect ? 'button' : 'div';

        return (
          <li key={item.key}>
            <Row
              {...(onSelect
                ? { type: 'button' as const, onClick: () => onSelect(item.key) }
                : {})}
              className={clsx(
                'w-full text-start',
                onSelect && 'cursor-pointer rounded-lg p-1.5 transition-colors hover:bg-surface-raised',
                active && 'bg-surface-raised',
              )}
            >
              <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                <span className="text-content">{item.label}</span>
                <span className="tabular-nums text-content-muted latn">
                  {item.percent}٪ ({item.count})
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                <div
                  className={clsx(
                    'h-full rounded-full transition-[width] duration-500',
                    active ? 'bg-brand-soft' : 'bg-brand/70',
                  )}
                  style={{ width: `${Math.max(2, item.percent)}%` }}
                />
              </div>
            </Row>
          </li>
        );
      })}
    </ul>
  );
}

export function StatusBadge({
  status,
}: {
  status: 'pending' | 'processing' | 'ready' | 'indexed' | 'error' | string;
}) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: 'در صف', className: 'bg-surface-raised text-content-muted' },
    processing: { label: 'در حال پردازش', className: 'bg-state-thinking/15 text-state-thinking' },
    ready: { label: 'آماده', className: 'bg-state-listening/15 text-state-listening' },
    indexed: { label: 'ایندکس شد', className: 'bg-state-listening/15 text-state-listening' },
    error: { label: 'خطا', className: 'bg-state-error/15 text-state-error' },
  };

  const entry = map[status] ?? { label: status, className: 'bg-surface-raised text-content-muted' };

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium',
        entry.className,
      )}
    >
      {status === 'processing' && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      )}
      {entry.label}
    </span>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={clsx(
        'flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface-sunken p-3 transition-colors',
        checked && 'border-brand/40 bg-brand-wash',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="sr-only"
      />
      <span
        className={clsx(
          'mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-colors',
          checked ? 'border-brand bg-brand text-ink' : 'border-line-strong bg-surface',
        )}
        style={{ height: '1.125rem', width: '1.125rem' }}
      >
        {checked && <CheckIcon className="h-3 w-3" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-content">{label}</span>
        {description && <span className="mt-0.5 block hint">{description}</span>}
      </span>
    </label>
  );
}

export function Alert({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'error' | 'success';
  children: ReactNode;
}) {
  const styles = {
    info: 'border-line bg-surface-sunken text-content-muted',
    warn: 'border-state-thinking/35 bg-state-thinking/10 text-state-thinking',
    error: 'border-state-error/35 bg-state-error/10 text-state-error',
    success: 'border-state-listening/35 bg-state-listening/10 text-state-listening',
  }[tone];

  return (
    <div className={clsx('flex items-start gap-2 rounded-xl border p-3 text-xs leading-relaxed', styles)}>
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
      aria-hidden
    />
  );
}
