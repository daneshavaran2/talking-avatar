'use client';

import { InfoIcon, SaveIcon, TriangleAlertIcon } from 'lucide-react';
import { toast } from 'sonner';

import { SectionCard } from '@/components/admin/ui';
import { useSettings } from '@/components/admin/use-settings';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';

/**
 * ابزارهای خارجی (§F9).
 *
 * فقط ابزارهای فعال به مدل زبانی معرفی می‌شوند — معرفی ابزاری که
 * پشتش Workflow ندارد باعث می‌شود مدل وعده‌ای بدهد که محقق نمی‌شود.
 */
export function ToolsPanel() {
  const { settings, capabilities, tools, loading, saving, patch, save } = useSettings();

  if (loading || !settings) {
    return (
      <SectionCard title="ابزارهای خارجی">
        <Skeleton className="h-64 w-full" />
      </SectionCard>
    );
  }

  const toggle = (name: string, enabled: boolean) => {
    const next = enabled
      ? [...new Set([...settings.enabledTools, name])]
      : settings.enabledTools.filter((item) => item !== name);
    patch({ enabledTools: next });
  };

  const persist = async () => {
    const ok = await save({ enabledTools: settings.enabledTools });
    if (ok) toast.success('تغییرات ذخیره شد.');
    else toast.error('ذخیرهٔ تنظیمات ممکن نشد.');
  };

  return (
    <SectionCard
      title="ابزارهای خارجی"
      description="برای سؤالاتی که نیاز به دادهٔ زنده دارند — قیمت لحظه‌ای، موجودی انبار، وضعیت سفارش."
    >
      <div className="flex flex-col gap-4">
        {!capabilities?.tools && (
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertDescription>
              آدرس n8n تنظیم نشده است (<code className="latn">N8N_BASE_URL</code>). تا زمانی که
              اتوماسیون پیکربندی نشود، حتی ابزارهای فعال هم به مدل معرفی نمی‌شوند.
            </AlertDescription>
          </Alert>
        )}

        <Alert variant="info">
          <InfoIcon />
          <AlertDescription>
            هر ابزار به یک Webhook در n8n وصل می‌شود و هر درخواست با HMAC-SHA256 امضا می‌شود.
            Workflow باید امضا را در هدر <code className="latn">x-signature</code> بررسی کند.
          </AlertDescription>
        </Alert>

        <div className="flex flex-col gap-2">
          {tools.map((tool) => (
            <label
              key={tool.name}
              className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border p-3"
            >
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-sm">{tool.label}</span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  {tool.description} · مهلت پاسخ: {tool.timeoutMs} میلی‌ثانیه
                </span>
              </span>
              <Switch
                checked={settings.enabledTools.includes(tool.name)}
                onCheckedChange={(checked) => toggle(tool.name, checked)}
                className="mt-0.5 shrink-0"
              />
            </label>
          ))}
        </div>

        <div>
          <Button onClick={() => void persist()} disabled={saving}>
            {saving ? <Spinner /> : <SaveIcon />}
            ذخیرهٔ تغییرات
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}
