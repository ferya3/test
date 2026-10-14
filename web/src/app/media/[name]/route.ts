import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MEDIA_NAME, UPLOAD_DIR } from '@/lib/images';

/**
 * Serves uploaded images from outside `public/`.
 *
 * `next start` only serves files that were in `public/` at build time, so
 * uploads live in the data directory and come through here. The name is
 * checked against the exact shape `storeImage` produces, which also rules out
 * any path traversal before a path is ever built.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;

  if (!MEDIA_NAME.test(name)) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const body = await readFile(path.join(UPLOAD_DIR, name));

    return new Response(new Uint8Array(body), {
      headers: {
        'Content-Type': 'image/webp',
        // Names are random and never reused, so the bytes behind one never change.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
