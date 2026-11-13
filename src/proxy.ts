import { NextResponse, type NextRequest } from 'next/server';
import { authEnabled, sessionFromRequest } from '@/lib/auth-shared';

/**
 * Who may open what.
 *  - Login screen (with its shop board, /api/board) and /api/auth/* are always open.
 *  - A logged-in machinist only gets the floor screen and the few APIs it uses
 *    (the job routes further check it's their department / an allowed action).
 *  - Everyone else: with AUTH_ENABLED=true they must be logged in (admin);
 *    with it off the app stays open as before.
 */

const MACHINIST_API: Array<[method: string, pattern: RegExp]> = [
  ['GET', /^\/api\/jobs$/],
  ['GET', /^\/api\/jobs\/[^/]+$/],
  ['PUT', /^\/api\/jobs\/[^/]+$/],
  ['POST', /^\/api\/jobs\/[^/]+\/in-progress$/],
  ['GET', /^\/api\/departments$/],
  ['GET', /^\/api\/employees$/],
  ['GET', /^\/api\/file$/],
  ['GET', /^\/api\/live$/],
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');

  if (pathname === '/login' || pathname === '/api/board' || pathname.startsWith('/api/auth/')) return NextResponse.next();

  const session = await sessionFromRequest(request);

  if (session?.role === 'machinist') {
    if (isApi) {
      const ok = MACHINIST_API.some(([m, re]) => m === request.method && re.test(pathname));
      return ok ? NextResponse.next() : NextResponse.json({ error: 'No permitido' }, { status: 403 });
    }
    if (pathname === '/floor') return NextResponse.next();
    return NextResponse.redirect(new URL('/floor', request.url));
  }

  if (session || !authEnabled()) return NextResponse.next();

  if (isApi) return NextResponse.json({ error: 'Login required' }, { status: 401 });
  const url = new URL('/login', request.url);
  if (pathname !== '/') url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next's build assets and plain static files (icons,
  // pdf.worker, etc.).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)'],
};
