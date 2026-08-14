'use client';

import { Toaster as Sonner, type ToasterProps } from 'sonner';

/** اعلان‌ها. جهت راست‌به‌راست و فونت از خود صفحه ارث می‌برد. */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      dir="rtl"
      theme="dark"
      className="toaster group"
      position="bottom-center"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:font-sans',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
