import { SetupWizard } from '@/components/admin/SetupWizard';

export const dynamic = 'force-dynamic';

export default function AdminSetupPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold text-content">راه‌اندازی آواتار</h1>
        <p className="mt-1 hint">
          چهار مرحله تا آواتار فعال: چهره، صدا، دانش، و رفتار.
        </p>
      </header>

      <SetupWizard />
    </div>
  );
}
