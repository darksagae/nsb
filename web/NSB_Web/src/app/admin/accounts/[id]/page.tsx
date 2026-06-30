import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdminPageUser } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import { AccountDetailPanel } from '@/components/admin/accounts/AccountDetailPanel';
import { LeonIcon } from '@/components/admin/leon/LeonIcon';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = Number(id);
  if (!Number.isFinite(userId)) return { title: 'Account | Admin' };
  const user = await prisma.salesUser.findUnique({
    where: { id: userId },
    select: { displayName: true, username: true },
  });
  const name = user?.displayName ?? user?.username ?? 'Account';
  return { title: `${name} | Accounts | Admin` };
}

export default async function AdminAccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPageUser();
  const { id } = await params;
  const userId = Number(id);
  if (!Number.isFinite(userId)) notFound();

  const user = await prisma.salesUser.findUnique({
    where: { id: userId },
    select: { id: true, displayName: true, username: true, role: true },
  });
  if (!user) notFound();

  const displayName = user.displayName ?? user.username;

  return (
    <>
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-5 pb-3 border-bottom border-secondary-subtle">
        <div>
          <Link
            href="/admin/accounts"
            className="text-muted small text-decoration-none d-inline-flex align-items-center gap-1 leon-section-label mb-2"
          >
            <LeonIcon name="arrow-left" size={14} />
            Back to Accounts
          </Link>
          <h1 className="h3 fw-bold mb-1 tracking-tighter text-dark d-flex align-items-center gap-2 leon-heading">
            <LeonIcon name="users" size={22} className="leon-icon-accent" />
            {displayName}
          </h1>
          <p className="text-muted small mb-0 font-mono">
            @{user.username} · {user.role}
          </p>
        </div>
      </div>

      <AccountDetailPanel userId={user.id} displayName={displayName} />
    </>
  );
}
