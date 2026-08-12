import { ModelSettingsPanel } from '@/components/admin/ModelSettingsPanel';
import { RetentionPanel } from '@/components/admin/RetentionPanel';

export const dynamic = 'force-dynamic';

export default function AdminSettingsPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold text-content">تنظیمات مدل</h1>
      <ModelSettingsPanel />
      <RetentionPanel />
    </div>
  );
}
