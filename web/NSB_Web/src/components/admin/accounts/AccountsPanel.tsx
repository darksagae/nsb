'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { LeonIcon } from '@/components/admin/leon/LeonIcon';

type AccountUser = {
  id: number;
  username: string;
  password: string | null;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  isActive: boolean;
  online: boolean;
  lastSeenAt: string | null;
  invoiceCount: number;
  lastActivity: { action: string; createdAt: string } | null;
};

function formatWhen(iso: string | null) {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AccountsPanel() {
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<number, { username: string; password: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to load accounts');
      }
      const data = await res.json();
      const list: AccountUser[] = data.users ?? [];
      setUsers(list);
      const next: Record<number, { username: string; password: string }> = {};
      for (const u of list) {
        next[u.id] = {
          username: u.username,
          password: u.password ?? '',
        };
      }
      setDrafts(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const toggleReveal = (key: string) => {
    setRevealed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const updateDraft = (id: number, field: 'username' | 'password', value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const saveUser = async (user: AccountUser) => {
    const draft = drafts[user.id];
    if (!draft) return;

    setSavingId(user.id);
    setError(null);
    try {
      const body: Record<string, string | boolean> = {};
      if (draft.username.trim() !== user.username) {
        body.username = draft.username.trim();
      }
      if (draft.password && draft.password !== (user.password ?? '')) {
        body.password = draft.password;
      }

      if (Object.keys(body).length === 0) {
        setError('No changes to save for this account');
        return;
      }

      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Save failed');
      }

      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingId(null);
    }
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

  const resetPassword = async (user: AccountUser) => {
    const newPassword = generatePassword();
    const ok = window.confirm(
      `Reset password for ${user.displayName || user.username}?\n\nNew password: ${newPassword}\n\nCopy this before continuing.`,
    );
    if (!ok) return;

    setSavingId(user.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Reset failed');
      }
      window.alert(`Password reset for ${user.displayName || user.username}:\n\n${newPassword}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed');
    } finally {
      setSavingId(null);
    }
  };

  const toggleActive = async (user: AccountUser) => {
    setSavingId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update status');
    } finally {
      setSavingId(null);
    }
  };

  if (loading && users.length === 0) {
    return (
      <div className="text-center py-5 text-muted font-mono small">
        <LeonIcon name="refresh" size={20} className="spin mb-2" />
        Loading registered accounts…
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="alert alert-danger py-2 small mb-4" role="alert">
          {error}
        </div>
      )}

      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <span className="leon-section-label">Fleet accounts</span>
          <div className="small text-muted">
            {users.filter((u) => u.online).length} online · {users.length} registered
          </div>
        </div>
        <button type="button" className="btn btn-outline-dark btn-sm rounded-pill" onClick={load}>
          <LeonIcon name="refresh" size={14} className="me-1" />
          Refresh
        </button>
      </div>

      <div className="row g-4">
        {users.map((user) => {
          const draft = drafts[user.id] ?? { username: user.username, password: user.password ?? '' };
          const usernameKey = `u-${user.id}-name`;
          const passwordKey = `u-${user.id}-pass`;
          const showName = revealed[usernameKey];
          const showPass = revealed[passwordKey];

          return (
            <div key={user.id} className="col-12 col-xl-6">
              <div className="leon-bezel-outer h-100">
                <div className="leon-bezel-inner h-100">
                  <div className="d-flex justify-content-between align-items-start mb-3">
                    <div>
                      <div className="d-flex align-items-center gap-2 mb-1">
                        <span
                          className={`badge rounded-pill font-mono ${user.online ? 'bg-success-subtle text-success' : 'bg-secondary-subtle text-secondary'}`}
                        >
                          {user.online ? 'Online' : 'Offline'}
                        </span>
                        {!user.isActive && (
                          <span className="badge rounded-pill bg-danger-subtle text-danger font-mono">
                            Disabled
                          </span>
                        )}
                        <span className="badge rounded-pill bg-light text-dark border font-mono">
                          {user.role}
                        </span>
                      </div>
                      <div className="fw-bold text-dark leon-heading">
                        <Link
                          href={`/admin/accounts/${user.id}`}
                          className="text-dark text-decoration-none"
                        >
                          {user.displayName || user.username}
                        </Link>
                      </div>
                      <div className="small text-muted font-mono">
                        Last seen: {formatWhen(user.lastSeenAt)} · {user.invoiceCount} invoices
                      </div>
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="leon-section-label d-block mb-1">Username</label>
                    <div className="input-group input-group-sm">
                      <input
                        type={showName ? 'text' : 'password'}
                        className="form-control font-mono leon-input"
                        value={draft.username}
                        onChange={(e) => updateDraft(user.id, 'username', e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={() => toggleReveal(usernameKey)}
                        aria-label={showName ? 'Hide username' : 'Show username'}
                      >
                        <LeonIcon name={showName ? 'lock' : 'unlock'} size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="leon-section-label d-block mb-1">Password</label>
                    <div className="input-group input-group-sm">
                      <input
                        type={showPass ? 'text' : 'password'}
                        className="form-control font-mono leon-input"
                        value={draft.password}
                        placeholder={user.password ? undefined : 'Set new password'}
                        onChange={(e) => updateDraft(user.id, 'password', e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={() => toggleReveal(passwordKey)}
                        aria-label={showPass ? 'Hide password' : 'Show password'}
                      >
                        <LeonIcon name={showPass ? 'lock' : 'unlock'} size={14} />
                      </button>
                    </div>
                    {!user.password && (
                      <div className="leon-amount-hint text-start mt-1">
                        Legacy account — set password to store for admin view
                      </div>
                    )}
                  </div>

                  {user.lastActivity && (
                    <div className="small text-muted mb-3 font-mono">
                      Last: {user.lastActivity.action.replace(/_/g, ' ')} ·{' '}
                      {formatWhen(user.lastActivity.createdAt)}
                    </div>
                  )}

                  <div className="d-flex flex-wrap gap-2">
                    <Link
                      href={`/admin/accounts/${user.id}`}
                      className="btn btn-outline-primary btn-sm rounded-pill px-3"
                    >
                      Manage account
                    </Link>
                    <button
                      type="button"
                      className="btn btn-dark btn-sm rounded-pill px-3"
                      disabled={savingId === user.id}
                      onClick={() => saveUser(user)}
                    >
                      {savingId === user.id ? 'Saving…' : 'Save credentials'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-dark btn-sm rounded-pill px-3"
                      disabled={savingId === user.id}
                      onClick={() => resetPassword(user)}
                    >
                      Reset password
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm rounded-pill px-3 ${user.isActive ? 'btn-outline-danger' : 'btn-outline-success'}`}
                      disabled={savingId === user.id}
                      onClick={() => toggleActive(user)}
                    >
                      {user.isActive ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {users.length === 0 && !loading && (
        <div className="text-center py-5 text-muted font-mono small">
          No sales accounts registered yet. Accounts appear when users sign up on the sales system.
        </div>
      )}
    </div>
  );
}
