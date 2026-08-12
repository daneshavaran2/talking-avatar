import { VoicePanel } from '@/components/admin/VoicePanel';

export const dynamic = 'force-dynamic';

export default function AdminVoicePage() {
  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold text-content">صدای آواتار</h1>
      <VoicePanel />
    </div>
  );
}
