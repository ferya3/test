'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db, transaction } from '@/lib/db';
import { requireAdmin } from '@/lib/session';
import { SETTING_DEFAULTS, TRANSLATED_SETTINGS, type SettingKey } from '@/lib/queries';
import { bool, int, SLUG, str } from '@/lib/validate';
import { deleteImage, replaceImage } from '@/lib/images';
import type { ActionState } from './types';

/** Create (id = null) or update a product group. */
export async function saveCategory(id: number | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();

  const existing = id
    ? (db.prepare('SELECT image FROM categories WHERE id = ?').get(id) as { image: string | null } | undefined)
    : undefined;
  if (id && !existing) return { ok: false, message: 'این گروه دیگر وجود ندارد.' };

  const errors: Record<string, string> = {};
  const name = str(form, 'name', 120);
  if (name.length < 2) errors.name = 'نام گروه را وارد کنید.';

  // The address of a group is fixed once created: links to it are shared.
  const slug = str(form, 'slug', 60).toLowerCase();
  if (!id) {
    if (!SLUG.test(slug)) errors.slug = 'فقط حروف کوچک انگلیسی، عدد و خط تیره؛ مثل hpl-worktop';
    else if (db.prepare('SELECT 1 FROM categories WHERE slug = ?').get(slug)) errors.slug = 'این نشانی برای گروه دیگری است.';
  }
  if (Object.keys(errors).length > 0) return { ok: false, message: 'لطفاً خطاهای فرم را برطرف کنید.', errors };

  const image = await replaceImage(form, existing?.image ?? null);
  if (typeof image === 'object' && image) return image;

  const scene = str(form, 'scene', 10) === 'cubicles' ? 'cubicles' : 'kitchen';
  const values = [
    name,
    str(form, 'short', 300),
    str(form, 'description', 3000),
    str(form, 'name_en', 120),
    str(form, 'short_en', 300),
    str(form, 'description_en', 3000),
    int(form, 'position', 0, 999),
    bool(form, 'is_active') ? 1 : 0,
    image,
    scene,
    str(form, 'seo_title', 120),
    str(form, 'seo_description', 320),
    str(form, 'seo_title_en', 120),
    str(form, 'seo_description_en', 320),
  ];

  if (id) {
    db.prepare(
      `UPDATE categories SET name=?, short=?, description=?, name_en=?, short_en=?, description_en=?,
         position=?, is_active=?, image=?, scene=?,
         seo_title=?, seo_description=?, seo_title_en=?, seo_description_en=? WHERE id=?`,
    ).run(...values, id);
  } else {
    db.prepare(
      `INSERT INTO categories (name, short, description, name_en, short_en, description_en, position, is_active, image, scene,
         seo_title, seo_description, seo_title_en, seo_description_en, slug)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(...values, slug);
  }

  if (existing?.image && existing.image !== image) await deleteImage(existing.image);

  revalidatePath('/', 'layout');
  if (!id) redirect('/admin/categories');
  return { ok: true, message: 'ذخیره شد.' };
}

/** A group can go only once it has no products; its projects are kept, without a group. */
export async function deleteCategory(id: number): Promise<void> {
  await requireAdmin();

  const { n } = db.prepare('SELECT COUNT(*) AS n FROM products WHERE category_id = ?').get(id) as { n: number };
  if (n > 0) return;

  const row = db.prepare('SELECT image FROM categories WHERE id = ?').get(id) as { image: string | null } | undefined;
  if (row) {
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    await deleteImage(row.image);
  }

  revalidatePath('/', 'layout');
  redirect('/admin/categories');
}

/** Long text fields; everything else is a single line. */
const LONG: SettingKey[] = ['intro_body'];

export async function saveSettings(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();

  const errors: Record<string, string> = {};
  const values: [SettingKey, string][] = [];

  // Only the keys this form has: the hero has its own page and form, and a
  // field that is not on the page must not be blanked.
  for (const key of Object.keys(SETTING_DEFAULTS) as SettingKey[]) {
    if (!form.has(key)) continue;
    // Line endings normalised so paragraph splitting on the site is reliable.
    const value = str(form, key, LONG.includes(key) ? 6000 : 300).replace(/\r\n?/g, '\n');
    if (key === 'company_name' && value.length < 2) errors[key] = 'نام شرکت را وارد کنید.';
    if (key === 'founded_year' && value && !/^\d{4}$/.test(value)) errors[key] = 'سال چهاررقمی، مثل ۱۳۷۵.';
    if (key === 'contact_email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors[key] = 'ایمیل معتبر نیست.';
    if (key === 'google_site_verification') {
      // The whole <meta> tag may be pasted; only its content is kept, and only
      // if it has the shape of a token, since it is written into every page.
      const token = value.match(/content=["']([^"']+)["']/)?.[1] ?? value;
      if (token && !/^[\w-]{10,100}$/.test(token)) errors[key] = 'کد معتبر نیست؛ مقدار content تگ را بچسبانید.';
      values.push([key, token]);
      continue;
    }
    values.push([key, value]);
  }

  // English versions of the text settings, under `<key>_en`. Empty is allowed:
  // the English site then shows its built-in default for that text.
  for (const key of TRANSLATED_SETTINGS) {
    if (!form.has(`${key}_en`)) continue;
    const value = str(form, `${key}_en`, LONG.includes(key) ? 6000 : 300).replace(/\r\n?/g, '\n');
    values.push([`${key}_en` as SettingKey, value]);
  }

  if (Object.keys(errors).length > 0) return { ok: false, message: 'لطفاً خطاها را برطرف کنید.', errors };

  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  transaction(() => values.forEach(([k, v]) => upsert.run(k, v)));

  revalidatePath('/', 'layout');
  return { ok: true, message: 'محتوای سایت ذخیره شد.' };
}

export async function setLeadRead(id: number, read: boolean): Promise<void> {
  await requireAdmin();
  db.prepare('UPDATE leads SET is_read = ? WHERE id = ?').run(read ? 1 : 0, id);
  revalidatePath('/admin', 'layout');
}

export async function deleteLead(id: number): Promise<void> {
  await requireAdmin();
  db.prepare('DELETE FROM leads WHERE id = ?').run(id);
  revalidatePath('/admin', 'layout');
}

/** One production step's text and photo. */
export async function saveProcessStep(id: number, _prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();

  const step = db.prepare('SELECT image FROM process_steps WHERE id = ?').get(id) as { image: string | null } | undefined;
  if (!step) return { ok: false, message: 'این مرحله وجود ندارد.' };

  const title = str(form, 'title', 80);
  const body = str(form, 'body', 400);
  const titleEn = str(form, 'title_en', 80);
  const bodyEn = str(form, 'body_en', 400);
  if (title.length < 2) return { ok: false, errors: { title: 'عنوان را وارد کنید.' } };

  const image = await replaceImage(form, step.image);
  if (typeof image === 'object' && image) return image;

  db.prepare('UPDATE process_steps SET title = ?, body = ?, title_en = ?, body_en = ?, image = ? WHERE id = ?').run(
    title,
    body,
    titleEn,
    bodyEn,
    image,
    id,
  );
  if (step.image && step.image !== image) await deleteImage(step.image);

  revalidatePath('/', 'layout');
  return { ok: true, message: 'ذخیره شد.' };
}

/** The home page's hero: texts in both languages, button, phone, background photo. */
export async function saveHero(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();

  const title = str(form, 'hero_title', 200);
  if (title.length < 2) return { ok: false, errors: { hero_title: 'عنوان را وارد کنید.' } };

  // The button may only point at a page of this site.
  const allowed = new Set(['', '/projects', '/about', '/contact']);
  for (const { slug } of db.prepare('SELECT slug FROM categories').all() as { slug: string }[]) allowed.add(`/categories/${slug}`);
  const href = str(form, 'hero_cta_href', 200);
  if (!allowed.has(href)) return { ok: false, errors: { hero_cta_href: 'مقصد نامعتبر.' } };

  const current = (db.prepare("SELECT value FROM settings WHERE key = 'hero_image'").get() as { value: string } | undefined)?.value || null;
  const image = await replaceImage(form, current);
  if (typeof image === 'object' && image) return image;

  const values: [string, string][] = [
    ['hero_overline', str(form, 'hero_overline', 120)],
    ['hero_title', title],
    ['hero_lead', str(form, 'hero_lead', 600)],
    ['hero_cta_label', str(form, 'hero_cta_label', 60)],
    ['hero_overline_en', str(form, 'hero_overline_en', 120)],
    ['hero_title_en', str(form, 'hero_title_en', 200)],
    ['hero_lead_en', str(form, 'hero_lead_en', 600)],
    ['hero_cta_label_en', str(form, 'hero_cta_label_en', 60)],
    ['hero_cta_href', href],
    ['hero_show_phone', bool(form, 'hero_show_phone') ? '1' : '0'],
    ['hero_image', image ?? ''],
  ];

  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  transaction(() => values.forEach(([k, v]) => upsert.run(k, v)));
  if (current && current !== image) await deleteImage(current);

  revalidatePath('/', 'layout');
  return { ok: true, message: 'هیرو ذخیره شد.' };
}
