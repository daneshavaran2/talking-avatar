import { KnowledgePanel } from '@/components/admin/KnowledgePanel';

export const dynamic = 'force-dynamic';

export default function AdminKnowledgePage() {
  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold text-content">پایگاه دانش</h1>
      <KnowledgePanel />
    </div>
  );
}
