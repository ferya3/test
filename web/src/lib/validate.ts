/**
 * Small helpers for reading FormData on the server. Every value is coerced to
 * the shape expected and bounded in length; nothing from a form is used as
 * received.
 */
export function str(form: FormData, key: string, max = 500): string {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function int(form: FormData, key: string, min: number, max: number, fallback = 0): number {
  const n = Number.parseInt(str(form, key, 12), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export const bool = (form: FormData, key: string) => form.get(key) === 'on' || form.get(key) === '1';

export function file(form: FormData, key: string): File | null {
  const value = form.get(key);
  return value instanceof File && value.size > 0 ? value : null;
}

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
