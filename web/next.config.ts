import type { NextConfig } from 'next';

/**
 * Security headers applied to every response.
 *
 * The CSP is strict on script and object sources — the two that matter for
 * XSS — and deliberately permissive on style: Framer Motion and GSAP write
 * inline `style` attributes on every frame, and a nonce cannot cover those.
 * `blob:` is allowed for workers because three.js decodes some textures in
 * one.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // React's development build evaluates strings to rebuild stack traces;
      // production never needs eval, so it is allowed in dev only.
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // The repository root has its own lockfile (the Laravel app); without this
  // Next guesses the root from lockfiles and picks the wrong one. npm scripts
  // always run from web/, so the working directory is the app.
  outputFileTracingRoot: process.cwd(),

  // sharp is a native module and must not be bundled. Next lists it as
  // external by default, but naming it here makes the requirement explicit
  // rather than an accident of the framework's defaults.
  serverExternalPackages: ['sharp'],

  images: {
    formats: ['image/avif', 'image/webp'],
  },

  experimental: {
    serverActions: {
      // Product photographs. Anything larger is rejected before it reaches
      // sharp rather than buffered in memory first.
      bodySizeLimit: '8mb',
    },
  },

  /**
   * Persian pages have no language prefix in their address; internally they
   * are the `fa` value of the `[lang]` segment. Everything that is not
   * English, the admin, an upload or one of Next's own files goes there.
   * See src/middleware.ts for why this is not done in middleware.
   */
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/', destination: '/fa' },
        {
          // A top-level name with an extension is a file — public/ (logo,
          // share images) or a generated one (icons, robots, sitemap) — never a page.
          source: '/:path((?!en(?:/|$)|fa(?:/|$)|admin(?:/|$)|media/|_next/|[^/]+\\.[a-z0-9]+$).+)',
          destination: '/fa/:path',
        },
      ],
    };
  },

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default config;
