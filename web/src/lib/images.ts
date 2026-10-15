/**
 * Uploaded images: decoded and re-encoded to WebP by sharp, never stored as
 * received.
 *
 * Validation is by decoding, not by trusting the file name or the
 * Content-Type the browser sent — both are just strings the client chose. A
 * file is accepted only if sharp can read it as one of four raster formats,
 * and what is written to disk is a fresh WebP produced from the decoded
 * pixels, so nothing else that was in the file (a script, a polyglot payload,
 * EXIF location data) survives the trip. SVG is refused: it is a document that
 * can carry script, not an image.
 */
import sharp from 'sharp';
import { randomBytes } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'data', 'uploads');

export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
const ACCEPTED = new Set(['jpeg', 'png', 'webp', 'avif']);
const MAX_EDGE = 1800;
// Rejects decompression bombs: a tiny file that inflates to gigapixels.
const MAX_INPUT_PIXELS = 40_000_000;

/** A stored image's name: random, so it cannot be guessed or collide. */
export const MEDIA_NAME = /^[a-z0-9]{24}\.webp$/;

export class UploadError extends Error {}

export async function storeImage(file: File): Promise<string> {
  if (file.size === 0) throw new UploadError('فایلی انتخاب نشده است.');
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError('حجم تصویر باید کمتر از ۶ مگابایت باشد.');

  const input = Buffer.from(await file.arrayBuffer());

  let format: string | undefined;
  try {
    format = (await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()).format;
  } catch {
    throw new UploadError('این فایل تصویر معتبری نیست.');
  }

  if (!format || !ACCEPTED.has(format)) {
    throw new UploadError('فقط تصویر JPG، PNG، WebP یا AVIF پذیرفته می‌شود.');
  }

  const output = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate() // honour the camera's orientation before metadata is dropped
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, effort: 5 })
    .toBuffer();

  const name = `${randomBytes(12).toString('hex')}.webp`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, name), output, { mode: 0o644 });

  return name;
}

export async function deleteImage(name: string | null): Promise<void> {
  if (!name || !MEDIA_NAME.test(name)) return;

  await unlink(path.join(UPLOAD_DIR, name)).catch(() => {});
}

/**
 * The image a form leaves a record with: a newly uploaded one, none if
 * "remove" was ticked, or the current one. Returns an error state instead
 * when the upload is not an acceptable image. The caller deletes the old file
 * once the record is saved, so a failed save never loses the current photo.
 */
/** The "remove the current image" checkbox of an image field (see ImageInput). */
export const removeField = (field: string) => (field === 'image' ? 'remove_image' : `remove_${field}`);

export async function replaceImage(
  form: FormData,
  current: string | null,
  field = 'image',
): Promise<string | null | { ok: false; errors: Record<string, string> }> {
  const value = form.get(field);

  if (value instanceof File && value.size > 0) {
    try {
      return await storeImage(value);
    } catch (error) {
      if (error instanceof UploadError) return { ok: false, errors: { [field]: error.message } };
      throw error;
    }
  }

  return form.get(removeField(field)) === 'on' ? null : current;
}
