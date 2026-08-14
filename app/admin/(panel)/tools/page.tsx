import { ToolsPanel } from '@/components/admin/ToolsPanel';

export const dynamic = 'force-dynamic';

export default function AdminToolsPage() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold">ابزارهای خارجی</h1>
      <ToolsPanel />
    </div>
  );
}
