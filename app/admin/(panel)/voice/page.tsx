import { VoicePanel } from '@/components/admin/VoicePanel';

export const dynamic = 'force-dynamic';

export default function AdminVoicePage() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold">صدای آواتار</h1>
      <VoicePanel />
    </div>
  );
}
