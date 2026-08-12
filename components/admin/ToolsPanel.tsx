'use client';

import { Alert, Card, Spinner, Toggle } from '@/components/admin/ui';
import { useSettings } from '@/components/admin/use-settings';

/**
 * ابزارهای خارجی (§F9).
 *
 * هر ابزار مستقلاً فعال/غیرفعال می‌شود. فقط ابزارهای فعال به مدل
 * زبانی معرفی می‌شوند — معرفی ابزاری که پشتش Workflow ندارد باعث
 * می‌شود مدل وعده‌ای بدهد که محقق نمی‌شود.
 */
export function ToolsPanel() {
  const { settings, capabilities, tools, loading, saving, saved, error, patch, save } =
    useSettings();

  if (loading || !settings) {
    return (
      <Card title="ابزارهای خارجی">
        <div className="flex justify-center py-8 text-content-faint">
          <Spinner className="h-5 w-5" />
        </div>
      </Card>
    );
  }

  const toggle = (name: string, enabled: boolean) => {
    const next = enabled
      ? [...new Set([...settings.enabledTools, name])]
      : settings.enabledTools.filter((item) => item !== name);
    patch({ enabledTools: next });
  };

  return (
    <div className="space-y-5">
      <Card
        title="ابزارهای خارجی"
        description="برای سؤالاتی که نیاز به دادهٔ زنده دارند — قیمت لحظه‌ای، موجودی انبار، وضعیت سفارش."
      >
        <div className="space-y-4">
          {!capabilities?.tools && (
            <Alert tone="warn">
              آدرس n8n تنظیم نشده است (<code className="latn">N8N_BASE_URL</code>). تا زمانی که
              اتوماسیون پیکربندی نشود، حتی ابزارهای فعال هم به مدل معرفی نمی‌شوند.
            </Alert>
          )}

          <Alert tone="info">
            هر ابزار به یک Webhook در n8n وصل می‌شود:{' '}
            <code className="latn">POST {'{N8N_BASE_URL}'}/webhook/{'{tool-path}'}</code>. هر
            درخواست با HMAC-SHA256 امضا می‌شود و Workflow باید امضا را در هدر{' '}
            <code className="latn">x-signature</code> بررسی کند.
          </Alert>

          <div className="space-y-2">
            {tools.map((tool) => (
              <Toggle
                key={tool.name}
                checked={settings.enabledTools.includes(tool.name)}
                onChange={(next) => toggle(tool.name, next)}
                label={tool.label}
                description={`${tool.description} · مهلت پاسخ: ${tool.timeoutMs} میلی‌ثانیه`}
              />
            ))}
          </div>

          {error && <Alert tone="error">{error}</Alert>}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void save({ enabledTools: settings.enabledTools })}
              disabled={saving}
              className="btn-primary"
            >
              {saving && <Spinner />}
              ذخیرهٔ تغییرات
            </button>
            {saved && <span className="text-xs text-state-listening">ذخیره شد.</span>}
          </div>
        </div>
      </Card>
    </div>
  );
}
