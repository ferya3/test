import { NextResponse, type NextRequest } from 'next/server';

/**
 * Language routing.
 *
 * English pages live under `/en` and match the `[lang]` segment directly.
 * Persian pages have no prefix in their public address, so they are
 * rewritten internally to `/fa/…`. Anyone who types `/fa/…` is redirected to
 * the unprefixed address, so each page has exactly one URL per language.
 *
 * The language also travels to the root layout in a request header, which is
 * how `<html lang dir>` is set without the root layout knowing the route.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === '/fa' || pathname.startsWith('/fa/')) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(3) || '/';
    return NextResponse.redirect(url, 308);
  }

  const english = pathname === '/en' || pathname.startsWith('/en/');
  const headers = new Headers(request.headers);
  headers.set('x-locale', english ? 'en' : 'fa');

  if (english) {
    return NextResponse.next({ request: { headers } });
  }

  const url = request.nextUrl.clone();
  url.pathname = `/fa${pathname === '/' ? '' : pathname}`;
  url.search = search;
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  // Everything except the admin, uploaded images, Next's own files, and the
  // files at the root (icon, robots, sitemap).
  matcher: ['/((?!admin|media|_next|icon\\.svg|robots\\.txt|sitemap\\.xml|favicon\\.ico).*)'],
};
