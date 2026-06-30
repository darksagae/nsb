import { Suspense } from 'react';
import AdminLoginForm from './LoginForm';

export const metadata = { title: 'Sign in | NSBMotors Ug' };

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-vh-100 d-flex align-items-center justify-content-center">Loading…</div>}>
      <AdminLoginForm />
    </Suspense>
  );
}
