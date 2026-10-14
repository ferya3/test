'use server';

import { revalidatePath } from 'next/cache';
import { db, transaction } from '@/lib/db';
import { requireAdmin } from '@/lib/session';
import { SETTING_DEFAULTS, type SettingKey } from '@/lib/queries';
import { bool, int, str } from '@/lib/validate';
import { deleteImage, replaceImage } from '@/lib/images';
import type { ActionState } from './types';

export async function saveCategory(id: number, _prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();

  const name = str(form, 'name', 120);
  if (name.length < 2) return { ok: false, errors: { name: 'نام گروه را وارد کنید.' } };

  db.prepare('UPDATE categories SET name=?, short=?, description=?, position=?, is_active=? WHERE id=?').run(
    name,
    str(form, 'short', 300),
    str(form, 'description', 3000),
    int(form, 'position', 0, 999),
    bool(form, 'is_active') ? 1 : 0,
    id,
  );

  revalidatePath('/', 'layout');
  return { ok: true, message: 'ذخیره شد.' };
}

/** Long text fields; everything else is a single line. */
const LONG: SettingKey[] = ['intro_body', 'hero_lead'];

export async function saveSettings(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();

  const errors: Record<string, string> = {};
  const values: [SettingKey, string][] = [];

  for (const key of Object.keys(SETTING_DEFAULTS) as SettingKey[]) {
    // Line endings normalised so paragraph splitting on the site is reliable.
    const value = str(form, key, LONG.includes(key) ? 6000 : 300).replace(/\r\n?/g, '\n');
    if (key === 'company_name' && value.length < 2) errors[key] = 'نام شرکت را وارد کنید.';
    if (key === 'founded_year' && value && !/^\d{4}$/.test(value)) errors[key] = 'سال چهاررقمی، مثل ۱۳۷۵.';
    if (key === 'contact_email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors[key] = 'ایمیل معتبر نیست.';
    values.push([key, value]);
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
  if (title.length < 2) return { ok: false, errors: { title: 'عنوان را وارد کنید.' } };

  const image = await replaceImage(form, step.image);
  if (typeof image === 'object' && image) return image;

  db.prepare('UPDATE process_steps SET title = ?, body = ?, image = ? WHERE id = ?').run(title, body, image, id);
  if (step.image && step.image !== image) await deleteImage(step.image);

  revalidatePath('/', 'layout');
  return { ok: true, message: 'ذخیره شد.' };
}
