import { Suspense } from 'react';
import ResetPasswordForm from './ResetPasswordForm';

export const metadata = { title: 'Reset Password | Admin' };

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="p-5 text-center text-muted">Loading…</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
