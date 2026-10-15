'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/session';
import { attributeUsage, type AttributeKind } from '@/lib/attributes';
import { isTexture } from '@/lib/catalog';
import { int, SLUG, str } from '@/lib/validate';
import type { ActionState } from './types';

const KINDS = new Set<AttributeKind>(['family', 'surface', 'thickness']);
const THICKNESS = /^\d{1,3}(\.\d{1,2})?$/;

/** A URL-safe value from an English name: "Fantasy Marble" → "fantasy-marble". */
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

export async function addAttribute(kind: AttributeKind, _prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  if (!KINDS.has(kind)) return { ok: false, message: 'نوع نامعتبر.' };

  const errors: Record<string, string> = {};
  let value: string;
  let name: string;
  let nameEn: string;

  if (kind === 'thickness') {
    // A thickness is just its number in millimetres.
    value = str(form, 'value', 6).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/^0+(?=\d)/, '');
    if (!THICKNESS.test(value) || Number(value) <= 0) errors.value = 'عدد ضخامت به میلی‌متر، مثل ۴ یا ۱۹.۵';
    name = value;
    nameEn = value;
  } else {
    name = str(form, 'name', 60);
    nameEn = str(form, 'name_en', 60);
    value = str(form, 'value', 40).toLowerCase() || slugify(nameEn);
    if (name.length < 2) errors.name = 'نام را وارد کنید.';
    if (!SLUG.test(value)) errors.value = 'شناسهٔ انگلیسی (مثل fantasy) یا نام انگلیسی را وارد کنید.';
  }

  if (!errors.value && db.prepare('SELECT 1 FROM attributes WHERE kind = ? AND value = ?').get(kind, value)) {
    errors.value = 'این مورد از قبل وجود دارد.';
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const texture = str(form, 'texture', 10);
  const { n } = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM attributes WHERE kind = ?').get(kind) as { n: number };

  db.prepare('INSERT INTO attributes (kind, value, name, name_en, texture, position) VALUES (?, ?, ?, ?, ?, ?)').run(
    kind,
    value,
    name,
    nameEn,
    isTexture(texture) ? texture : 'solid',
    n,
  );

  revalidatePath('/', 'layout');
  return { ok: true, message: 'اضافه شد.' };
}

/**
 * Labels, texture and order. The value itself does not change: products and
 * bookmarked filter links point at it.
 */
export async function saveAttribute(id: number, _prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();

  const row = db.prepare('SELECT kind FROM attributes WHERE id = ?').get(id) as { kind: AttributeKind } | undefined;
  if (!row) return { ok: false, message: 'این مورد دیگر وجود ندارد.' };

  if (row.kind === 'thickness') {
    db.prepare('UPDATE attributes SET position = ? WHERE id = ?').run(int(form, 'position', 0, 999), id);
  } else {
    const name = str(form, 'name', 60);
    if (name.length < 2) return { ok: false, errors: { name: 'نام را وارد کنید.' } };
    const texture = str(form, 'texture', 10);

    db.prepare('UPDATE attributes SET name = ?, name_en = ?, texture = ?, position = ? WHERE id = ?').run(
      name,
      str(form, 'name_en', 60),
      isTexture(texture) ? texture : 'solid',
      int(form, 'position', 0, 999),
      id,
    );
  }

  revalidatePath('/', 'layout');
  return { ok: true, message: 'ذخیره شد.' };
}

export async function deleteAttribute(id: number): Promise<void> {
  await requireAdmin();

  const row = db.prepare('SELECT kind, value FROM attributes WHERE id = ?').get(id) as
    | { kind: AttributeKind; value: string }
    | undefined;

  // The page disables the button for an attribute in use; this is the check
  // that counts, for a request sent some other way.
  if (!row || attributeUsage(row.kind, row.value) > 0) return;

  db.prepare('DELETE FROM attributes WHERE id = ?').run(id);
  revalidatePath('/', 'layout');
}

/** Which attributes the public site shows; see attributeVisibility(). */
export async function saveAttributeVisibility(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();

  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const kind of KINDS) upsert.run(`attr_show_${kind}`, form.get(`show_${kind}`) === 'on' ? '1' : '0');

  revalidatePath('/', 'layout');
  return { ok: true, message: 'ذخیره شد.' };
}
