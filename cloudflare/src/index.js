const CANONICAL_HOST = 'artavilcrown.com';

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
    "font-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // www.artavilcrown.com → artavilcrown.com
    if (url.hostname === `www.${CANONICAL_HOST}`) {
      url.hostname = CANONICAL_HOST;
      return Response.redirect(url.toString(), 301);
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const response = new Response(assetResponse.body, assetResponse);

    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      response.headers.set(name, value);
    }

    // فونت‌ها یک سال، تصاویر یک روز کش شوند. HTML همیشه تازه بماند.
    if (/\.woff2$/i.test(url.pathname)) {
      response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (/\.(ico|png|jpe?g|webp|avif|svg)$/i.test(url.pathname)) {
      response.headers.set('Cache-Control', 'public, max-age=86400');
    }

    return response;
  },
};
