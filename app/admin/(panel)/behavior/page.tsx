import { BehaviorPanel } from '@/components/admin/BehaviorPanel';

export const dynamic = 'force-dynamic';

export default function AdminBehaviorPage() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold">رفتار و محدودیت‌ها</h1>
      <BehaviorPanel />
    </div>
  );
}
