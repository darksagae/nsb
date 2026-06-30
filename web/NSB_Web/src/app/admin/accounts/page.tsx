import { requireAdminPageUser } from '@/lib/admin-auth';
import { AccountsPanel } from '@/components/admin/accounts/AccountsPanel';
import { LeonIcon } from '@/components/admin/leon/LeonIcon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Accounts | Admin' };

export default async function AdminAccountsPage() {
  await requireAdminPageUser();

  return (
    <>
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-5 pb-3 border-bottom border-secondary-subtle">
        <div>
          <h1 className="h3 fw-bold mb-1 tracking-tighter text-dark d-flex align-items-center gap-2 leon-heading">
            <LeonIcon name="users" size={22} className="leon-icon-accent" />
            Account Control
          </h1>
          <p className="text-muted small mb-0">
            Monitor registered sales accounts on access.nsbmotors.com. View credentials, update usernames and passwords, and track online status.
          </p>
        </div>
      </div>

      <AccountsPanel />
    </>
  );
}
