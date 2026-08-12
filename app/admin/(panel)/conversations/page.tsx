import { ConversationArchive } from '@/components/admin/ConversationArchive';

export const dynamic = 'force-dynamic';

export default async function AdminConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const { topic } = await searchParams;
  return <ConversationArchive initialTopic={topic} />;
}
