'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import '../login/glass-login.css';

const NSB_LOGO_SRC = '/assets/images/nsb-logo.png';

export default function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!token) {
      setError('Invalid reset link. Request a new one from the login page.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Reset failed');
        return;
      }
      setMessage(data.message || 'Password updated.');
      setTimeout(() => router.replace('/admin/login'), 2000);
    } catch {
      setError('Could not reset password. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="glass-login-root">
      <section className="glass-login-right" style={{ width: '100%' }}>
        <div className="glass-login-panel">
          <div className="glass-login-logo">
            <Image
              src={NSB_LOGO_SRC}
              alt="NSBMotors Ug"
              width={140}
              height={80}
              style={{ objectFit: 'contain', width: 'auto', height: 'auto', maxWidth: '140px', maxHeight: '72px' }}
              priority
            />
          </div>

          <h1 className="glass-login-heading">Reset Password</h1>
          <p className="glass-login-subheading">Choose a new control panel password</p>

          <form onSubmit={handleSubmit}>
            <div className="glass-login-field">
              <div className="glass-login-input-wrap">
                <input
                  type="password"
                  className="glass-login-input"
                  placeholder="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <div className="glass-login-field">
              <div className="glass-login-input-wrap">
                <input
                  type="password"
                  className="glass-login-input"
                  placeholder="Confirm password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
              </div>
            </div>

            {message ? <div className="glass-login-error text-success border-success" role="status">{message}</div> : null}
            {error ? <div className="glass-login-error" role="alert">{error}</div> : null}

            <button type="submit" className="glass-login-submit" disabled={loading}>
              {loading ? <span className="glass-login-spinner" aria-hidden /> : 'Update password'}
            </button>
          </form>

          <p className="glass-login-subheading mt-3 mb-0">
            <Link href="/admin/login">Back to sign in</Link>
          </p>
        </div>
      </section>
    </div>
  );
}
