import { KnowledgePanel } from '@/components/admin/KnowledgePanel';

export const dynamic = 'force-dynamic';

export default function AdminKnowledgePage() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold">پایگاه دانش</h1>
      <KnowledgePanel />
    </div>
  );
}
