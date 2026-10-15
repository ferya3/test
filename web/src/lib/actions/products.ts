'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/session';
import { deleteImage, storeImage, UploadError } from '@/lib/images';
import { attributeCatalog } from '@/lib/attributes';
import { bool, file, int, SLUG, str } from '@/lib/validate';
import type { ActionState } from './types';

/** Create (id = null) or update a product. */
export async function saveProduct(id: number | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();

  const existing = id
    ? (db.prepare('SELECT id, image FROM products WHERE id = ?').get(id) as { id: number; image: string | null } | undefined)
    : undefined;
  if (id && !existing) return { ok: false, message: 'این محصول دیگر وجود ندارد.' };

  const code = str(form, 'code', 30).toUpperCase();
  const catalog = attributeCatalog('fa');
  const data = {
    name: str(form, 'name', 120),
    code,
    slug: str(form, 'slug', 120).toLowerCase() || code.toLowerCase(),
    category_id: int(form, 'category_id', 0, 1e9),
    short: str(form, 'short', 300),
    description: str(form, 'description', 5000),
    family: str(form, 'family', 20),
    surface: str(form, 'surface', 20),
    // Only known thicknesses, in the catalogue's own order.
    thicknesses: catalog.thicknessOrder.filter((t) => form.getAll('thicknesses').includes(t)),
    color_hex: str(form, 'color_hex', 7).toLowerCase(),
    position: int(form, 'position', 0, 9999),
    is_featured: bool(form, 'is_featured') ? 1 : 0,
    is_active: bool(form, 'is_active') ? 1 : 0,
    // English; left empty, the English site shows the Persian.
    name_en: str(form, 'name_en', 120),
    short_en: str(form, 'short_en', 300),
    description_en: str(form, 'description_en', 5000),
  };

  const errors: Record<string, string> = {};
  if (data.name.length < 2) errors.name = 'نام محصول را وارد کنید.';
  if (!/^[A-Z0-9-]{2,30}$/.test(data.code)) errors.code = 'کد فقط از حروف انگلیسی، عدد و خط تیره.';
  if (!SLUG.test(data.slug)) errors.slug = 'فقط حروف کوچک انگلیسی، عدد و خط تیره؛ مثل natural-oak-18';
  if (!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(data.category_id)) errors.category_id = 'گروه را انتخاب کنید.';
  if (!catalog.values.families.has(data.family)) errors.family = 'طرح را انتخاب کنید.';
  if (!catalog.values.surfaces.has(data.surface)) errors.surface = 'سطح را انتخاب کنید.';
  if (data.thicknesses.length === 0) errors.thicknesses = 'دست‌کم یک ضخامت.';
  if (!/^#[0-9a-f]{6}$/.test(data.color_hex)) errors.color_hex = 'رنگ معتبر نیست.';

  const taken = (column: 'slug' | 'code', value: string) =>
    db.prepare(`SELECT 1 FROM products WHERE ${column} = ? AND id != ?`).get(value, id ?? 0);
  if (!errors.slug && taken('slug', data.slug)) errors.slug = 'این نشانی برای محصول دیگری است.';
  if (!errors.code && taken('code', data.code)) errors.code = 'این کد برای محصول دیگری است.';

  if (Object.keys(errors).length > 0) {
    return { ok: false, message: 'لطفاً خطاهای فرم را برطرف کنید.', errors };
  }

  // The image last, so a form with other errors never leaves an orphan file.
  let image = existing?.image ?? null;
  const upload = file(form, 'image');

  if (upload) {
    try {
      image = await storeImage(upload);
    } catch (error) {
      if (error instanceof UploadError) return { ok: false, errors: { image: error.message } };
      throw error;
    }
  } else if (bool(form, 'remove_image')) {
    image = null;
  }

  const values = [
    data.slug,
    data.code,
    data.category_id,
    data.name,
    data.short,
    data.description,
    data.family,
    data.surface,
    data.thicknesses.join(','),
    data.color_hex,
    image,
    data.is_featured,
    data.is_active,
    data.position,
    data.name_en,
    data.short_en,
    data.description_en,
  ];

  if (id) {
    db.prepare(
      `UPDATE products SET slug=?, code=?, category_id=?, name=?, short=?, description=?, family=?, surface=?,
         thicknesses=?, color_hex=?, image=?, is_featured=?, is_active=?, position=?,
         name_en=?, short_en=?, description_en=? WHERE id = ?`,
    ).run(...values, id);
  } else {
    db.prepare(
      `INSERT INTO products (slug, code, category_id, name, short, description, family, surface,
         thicknesses, color_hex, image, is_featured, is_active, position, name_en, short_en, description_en)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(...values);
  }

  if (existing?.image && existing.image !== image) await deleteImage(existing.image);

  revalidatePath('/', 'layout');

  if (!id) redirect('/admin/products?saved=1');
  return { ok: true, message: 'ذخیره شد.' };
}

export async function deleteProduct(id: number): Promise<void> {
  await requireAdmin();

  const row = db.prepare('SELECT image FROM products WHERE id = ?').get(id) as { image: string | null } | undefined;
  if (row) {
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    await deleteImage(row.image);
  }

  revalidatePath('/', 'layout');
  redirect('/admin/products');
}

export async function toggleProduct(id: number): Promise<void> {
  await requireAdmin();
  db.prepare('UPDATE products SET is_active = 1 - is_active WHERE id = ?').run(id);
  revalidatePath('/', 'layout');
}
