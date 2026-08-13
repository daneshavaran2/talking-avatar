import { SetupWizard } from '@/components/admin/SetupWizard';

export const dynamic = 'force-dynamic';

export default function AdminSetupPage() {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-lg font-semibold">راه‌اندازی آواتار</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          چهار مرحله تا آواتار فعال: چهره، صدا، دانش، و رفتار.
        </p>
      </header>

      <SetupWizard />
    </div>
  );
}
