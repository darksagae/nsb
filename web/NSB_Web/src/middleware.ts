import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const SESSION_COOKIE = 'nsb_session';

const PUBLIC_ADMIN_PATHS = ['/admin/login', '/admin/reset-password'];
const PUBLIC_API_PREFIXES = [
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/sync/register',
  '/api/sync/bind-machine',
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  return PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/') {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const dest = token ? '/admin' : '/admin/login';
    return NextResponse.redirect(new URL(dest, request.url));
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/admin') || pathname.startsWith('/api/')) {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const bearer = request.headers.get('authorization')?.startsWith('Bearer ');
    if (bearer || token) return NextResponse.next();

    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/admin/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/admin/:path*', '/api/:path*'],
};
