'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/session';
import { deleteImage, replaceImage } from '@/lib/images';
import { bool, int, str } from '@/lib/validate';
import type { ActionState } from './types';

/** Create (id = null) or update a completed project. */
export async function saveProject(id: number | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();

  const existing = id
    ? (db.prepare('SELECT image FROM projects WHERE id = ?').get(id) as { image: string | null } | undefined)
    : undefined;
  if (id && !existing) return { ok: false, message: 'این نمونه کار دیگر وجود ندارد.' };

  const categoryId = int(form, 'category_id', 0, 1e9);
  const data = {
    title: str(form, 'title', 120),
    location: str(form, 'location', 120),
    // Western digits stored; the site shows them in Persian.
    year: str(form, 'year', 8).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)),
    description: str(form, 'description', 3000).replace(/\r\n?/g, '\n'),
    category_id: categoryId && db.prepare('SELECT 1 FROM categories WHERE id = ?').get(categoryId) ? categoryId : null,
    color_hex: str(form, 'color_hex', 7).toLowerCase(),
    position: int(form, 'position', 0, 9999),
    is_active: bool(form, 'is_active') ? 1 : 0,
    title_en: str(form, 'title_en', 120),
    location_en: str(form, 'location_en', 120),
    description_en: str(form, 'description_en', 3000).replace(/\r\n?/g, '\n'),
  };

  const errors: Record<string, string> = {};
  if (data.title.length < 2) errors.title = 'عنوان را وارد کنید.';
  if (data.year && !/^\d{4}$/.test(data.year)) errors.year = 'سال چهاررقمی، مثل ۱۴۰۳.';
  if (!/^#[0-9a-f]{6}$/.test(data.color_hex)) errors.color_hex = 'رنگ معتبر نیست.';
  if (Object.keys(errors).length > 0) return { ok: false, message: 'لطفاً خطاهای فرم را برطرف کنید.', errors };

  const image = await replaceImage(form, existing?.image ?? null);
  if (typeof image === 'object' && image) return image;

  const values = [
    data.title,
    data.location,
    data.year,
    data.description,
    data.category_id,
    data.color_hex,
    image,
    data.position,
    data.is_active,
    data.title_en,
    data.location_en,
    data.description_en,
  ];

  if (id) {
    db.prepare(
      `UPDATE projects SET title=?, location=?, year=?, description=?, category_id=?, color_hex=?, image=?,
         position=?, is_active=?, title_en=?, location_en=?, description_en=? WHERE id = ?`,
    ).run(...values, id);
  } else {
    db.prepare(
      `INSERT INTO projects (title, location, year, description, category_id, color_hex, image, position, is_active,
         title_en, location_en, description_en)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(...values);
  }

  if (existing?.image && existing.image !== image) await deleteImage(existing.image);

  revalidatePath('/', 'layout');
  if (!id) redirect('/admin/projects');
  return { ok: true, message: 'ذخیره شد.' };
}

export async function deleteProject(id: number): Promise<void> {
  await requireAdmin();

  const row = db.prepare('SELECT image FROM projects WHERE id = ?').get(id) as { image: string | null } | undefined;
  if (row) {
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    await deleteImage(row.image);
  }

  revalidatePath('/', 'layout');
  redirect('/admin/projects');
}

export async function toggleProject(id: number): Promise<void> {
  await requireAdmin();
  db.prepare('UPDATE projects SET is_active = 1 - is_active WHERE id = ?').run(id);
  revalidatePath('/', 'layout');
}
