import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE = 'careersignal_session';
const PROTECTED_PREFIXES = ['/', '/profile', '/application-assistant'];
const AUTH_PAGES = ['/signin', '/signup'];

function isProtected(pathname: string): boolean {
  if (pathname === '/') return true;
  return PROTECTED_PREFIXES.some((p) => p !== '/' && pathname.startsWith(p));
}

function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function hasSessionCookie(request: NextRequest): boolean {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  return !!token && token.length > 0;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = hasSessionCookie(request);

  if (isAuthPage(pathname) && signedIn) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  if (isProtected(pathname) && !signedIn) {
    const signin = new URL('/signin', request.url);
    signin.searchParams.set('from', pathname);
    return NextResponse.redirect(signin);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
