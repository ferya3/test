import { NextResponse, type NextRequest } from 'next/server';

/**
 * Language routing, part one (part two is the rewrite in next.config.ts).
 *
 * English pages live under `/en` and match the `[lang]` segment directly.
 * Persian pages have no prefix in their public address; next.config.ts
 * rewrites them internally to `/fa/…`. Anyone who types `/fa/…` is
 * redirected here to the unprefixed address, so each page has exactly one
 * URL per language.
 *
 * The language also travels to the root layout in a request header, which is
 * how `<html lang dir>` is set without the root layout knowing the route.
 *
 * The Persian rewrite deliberately does not happen here. Behind nginx the
 * request's Host (the site's address) differs from the address Next.js
 * listens on, and Next treats a middleware rewrite to its own address as an
 * external URL: it fetched `/fa/…` over HTTP, which met the redirect below,
 * and every Persian page answered 308. Config rewrites are always internal.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/fa' || pathname.startsWith('/fa/')) {
    // Built from the address the visitor used — the Host and protocol nginx
    // passes on. request.nextUrl carries the address Next.js listens on
    // (localhost:3000), which a browser outside the server cannot reach.
    const host = request.headers.get('host') ?? request.nextUrl.host;
    const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '');
    const target = `${proto}://${host}${pathname.slice(3) || '/'}${request.nextUrl.search}`;
    return NextResponse.redirect(target, 308);
  }

  const headers = new Headers(request.headers);
  headers.set('x-locale', pathname === '/en' || pathname.startsWith('/en/') ? 'en' : 'fa');

  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Everything except the admin, uploaded images, Next's own files, and the
  // files at the root (icon, robots, sitemap).
  matcher: ['/((?!admin|media|_next|icon\\.svg|robots\\.txt|sitemap\\.xml|favicon\\.ico).*)'],
};
