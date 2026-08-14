import { AvatarPanel } from '@/components/admin/AvatarPanel';
import { FaceCalibration } from '@/components/admin/FaceCalibration';

export const dynamic = 'force-dynamic';

export default function AdminAvatarPage() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold">چهرهٔ آواتار</h1>
      <AvatarPanel />
      <FaceCalibration />
    </div>
  );
}
