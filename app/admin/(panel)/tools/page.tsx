import { ToolsPanel } from '@/components/admin/ToolsPanel';

export const dynamic = 'force-dynamic';

export default function AdminToolsPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold text-content">ابزارهای خارجی</h1>
      <ToolsPanel />
    </div>
  );
}
