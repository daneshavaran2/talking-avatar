import { AnalyticsDashboard } from '@/components/admin/AnalyticsDashboard';
import { SetupBanner } from '@/components/admin/SetupBanner';

export const dynamic = 'force-dynamic';

export default function AdminDashboardPage() {
  return (
    <>
      <SetupBanner />
      <AnalyticsDashboard />
    </>
  );
}
