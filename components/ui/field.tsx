import * as React from 'react';

import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

/**
 * پایه‌های چیدمان فرم (قرارداد shadcn/ui).
 * وضعیت خطا با `data-invalid` روی Field و `aria-invalid` روی خود
 * کنترل اعلام می‌شود.
 */

function FieldGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="field-group" className={cn('flex flex-col gap-5', className)} {...props} />
  );
}

function Field({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="field"
      className={cn('group/field flex flex-col gap-2 data-[invalid=true]:text-destructive', className)}
      {...props}
    />
  );
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn('group-data-[invalid=true]/field:text-destructive', className)}
      {...props}
    />
  );
}

function FieldDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="field-description"
      className={cn(
        'text-xs leading-relaxed text-muted-foreground group-data-[invalid=true]/field:text-destructive',
        className,
      )}
      {...props}
    />
  );
}

function FieldSet({ className, ...props }: React.ComponentProps<'fieldset'>) {
  return (
    <fieldset data-slot="field-set" className={cn('flex flex-col gap-3', className)} {...props} />
  );
}

function FieldLegend({ className, ...props }: React.ComponentProps<'legend'>) {
  return (
    <legend data-slot="field-legend" className={cn('text-sm font-medium', className)} {...props} />
  );
}

function FieldSeparator({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="field-separator" className={cn('h-px w-full bg-border', className)} {...props} />;
}

export {
  FieldGroup,
  Field,
  FieldLabel,
  FieldDescription,
  FieldSet,
  FieldLegend,
  FieldSeparator,
};
