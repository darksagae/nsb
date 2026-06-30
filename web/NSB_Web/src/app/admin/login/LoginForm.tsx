'use client';

import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import './glass-login.css';

const NSB_LOGO_SRC = '/assets/images/nsb-logo.png';
const LOGIN_HERO_SRC = '/assets/images/login-hero.png';

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M4 20c0-3.314 3.582-6 8-6s8 2.686 8 6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M8 11V8a4 4 0 1 1 8 0v3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/admin';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState('');

  async function handleForgotPassword() {
    setError('');
    setForgotMsg('');
    if (!username.trim()) {
      setError('Enter your username first');
      return;
    }
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), source: 'web' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Request failed');
        return;
      }
      setForgotMsg(data.message || 'The administrator will reset your password using the mobile control app.');
    } catch {
      setError('Could not send reset request');
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, source: 'web' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Invalid username or password');
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError('Unable to connect. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="glass-login-root">
      <section className="glass-login-left" aria-hidden="true">
        <Image
          src={LOGIN_HERO_SRC}
          alt=""
          fill
          priority
          sizes="50vw"
          className="glass-login-left__image"
        />
        <div className="glass-login-left__overlay" />
        <div className="glass-login-left__content">
          <div className="glass-login-left__badge">NSBMotors Ug</div>
          <h2 className="glass-login-left__title">Premium vehicle importation & sales</h2>
          <p className="glass-login-left__subtitle">
            Sign in with the same username and password as your sales machine.
          </p>
        </div>
      </section>

      <section className="glass-login-right">
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

          <h1 className="glass-login-heading">Welcome Back</h1>
          <p className="glass-login-subheading">Sign in to continue to NSBMotors Ug</p>
          <p className="glass-login-mobile-tagline">
            Same credentials as the sales machine. Password reset is done in the mobile control app.
          </p>

          <form onSubmit={handleSubmit}>
            <div className="glass-login-field">
              <div className="glass-login-input-wrap">
                <UserIcon />
                <input
                  id="username"
                  type="text"
                  className="glass-login-input"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  minLength={3}
                />
              </div>
            </div>

            <div className="glass-login-field">
              <div className="glass-login-input-wrap">
                <LockIcon />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="glass-login-input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  className="glass-login-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                      <path
                        d="M10.58 10.58A2 2 0 0 0 12 15a2 2 0 0 0 1.42-3.42M9.88 5.09A10.94 10.94 0 0 1 12 5c5 0 9.27 3.11 11 7.5a11.2 11.2 0 0 1-2.17 3.36M6.11 6.11A11.18 11.18 0 0 0 1 12.5C2.73 16.89 7 20 12 20a10.9 10.9 0 0 0 4.12-.8"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                      />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M2 12.5C3.73 8.11 8 5 13 5s9.27 3.11 11 7.5c-1.73 4.39-6 7.5-11 7.5S3.73 16.89 2 12.5Z"
                        stroke="currentColor"
                        strokeWidth="1.75"
                      />
                      <circle cx="13" cy="12.5" r="3" stroke="currentColor" strokeWidth="1.75" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="glass-login-forgot">
              <button type="button" onClick={handleForgotPassword}>
                Forgot Password?
              </button>
            </div>

            {forgotMsg ? <div className="glass-login-error text-success border-success" role="status">{forgotMsg}</div> : null}
            {error ? <div className="glass-login-error" role="alert">{error}</div> : null}

            <button type="submit" className="glass-login-submit" disabled={loading}>
              {loading ? (
                <span className="glass-login-spinner" aria-hidden />
              ) : (
                <>
                  Sign In
                  <ArrowIcon />
                </>
              )}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
