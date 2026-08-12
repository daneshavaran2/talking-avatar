import { AdminNav } from '@/components/admin/AdminNav';
import { requireAdminPage } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

/**
 * پوستهٔ پنل مدیریت.
 *
 * صفحهٔ ورود عمداً بیرون از این گروه است تا نوار کناری را نگیرد و
 * `requireAdminPage` روی آن اجرا نشود (وگرنه هدایت حلقه می‌شود).
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdminPage();

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:py-8">
      <AdminNav email={session.email} />
      <main className="min-w-0">{children}</main>
    </div>
  );
}
