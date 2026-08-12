import { AvatarPanel } from '@/components/admin/AvatarPanel';

export const dynamic = 'force-dynamic';

export default function AdminAvatarPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold text-content">چهرهٔ آواتار</h1>
      <AvatarPanel />
    </div>
  );
}
