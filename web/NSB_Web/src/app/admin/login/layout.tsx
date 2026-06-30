import type { ReactNode } from 'react';

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', background: '#ffffff', overflowX: 'hidden' }}>
      {children}
    </div>
  );
}
