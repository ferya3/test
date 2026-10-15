import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { MEDIA_NAME, UPLOAD_DIR } from '@/lib/images';
import { getSettings } from '@/lib/queries';

// Browser tab, home-screen (Apple) and large icon sizes.
const SIZES = new Set([32, 180, 512]);

/**
 * The site icon as a square PNG: the one uploaded in the admin (هویت برند),
 * or the built-in one. PNG, not the stored WebP, because Apple's home-screen
 * icon does not take WebP. The page links it with the uploaded file's name
 * in the query, so a new upload is a new URL and the old one can be cached.
 */
export async function GET(request: Request) {
  const size = Number(new URL(request.url).searchParams.get('s') ?? 32);
  if (!SIZES.has(size)) return new Response('Not found', { status: 404 });

  const uploaded = getSettings().site_icon;
  let source: Buffer;
  try {
    source = MEDIA_NAME.test(uploaded)
      ? await readFile(path.join(UPLOAD_DIR, uploaded))
      : await readFile(path.join(process.cwd(), 'public', 'icon.svg'));
  } catch {
    source = await readFile(path.join(process.cwd(), 'public', 'icon.svg'));
  }

  const png = await sharp(source, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' },
  });
}
