import { BehaviorPanel } from '@/components/admin/BehaviorPanel';

export const dynamic = 'force-dynamic';

export default function AdminBehaviorPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold text-content">رفتار و محدودیت‌ها</h1>
      <BehaviorPanel />
    </div>
  );
}
