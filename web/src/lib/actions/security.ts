'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/crypto';
import { newTotpSecret, verifyTotp } from '@/lib/totp';
import { endAllSessions, requireAdmin, startSession } from '@/lib/session';
import { str } from '@/lib/validate';
import type { ActionState } from './types';

async function checkPassword(userId: number, password: string): Promise<boolean> {
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string };
  return verifyPassword(password, row.password_hash);
}

export async function changePassword(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const current = str(form, 'current', 200);
  const next = str(form, 'next', 200);

  if (!(await checkPassword(user.id, current))) return { ok: false, errors: { current: 'رمز فعلی درست نیست.' } };
  if (next.length < 12) return { ok: false, errors: { next: 'دست‌کم ۱۲ نویسه.' } };
  if (next !== str(form, 'confirm', 200)) return { ok: false, errors: { confirm: 'تکرار رمز یکسان نیست.' } };

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(next), user.id);

  // Every other device is signed out; this one gets a fresh session.
  endAllSessions(user.id);
  await startSession(user.id, 'full');

  return { ok: true, message: 'رمز عبور تغییر کرد. نشست‌های دیگر خارج شدند.' };
}

/** Step 1: a new secret, stored but not yet trusted (totp_enabled stays 0). */
export async function beginTotp(): Promise<void> {
  const user = await requireAdmin();
  if (user.totp_enabled) return;

  db.prepare('UPDATE users SET totp_secret = ?, totp_last_step = 0 WHERE id = ?').run(newTotpSecret(), user.id);
  revalidatePath('/admin/security');
}

/**
 * Step 2: a code from the app proves it holds the secret; only then is 2FA on.
 * The secret is read from the user record, not the form or the session — the
 * earlier site lost enrolments by keeping it in a session that was rotated.
 */
export async function confirmTotp(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user.totp_secret) return { ok: false, message: 'ابتدا راه‌اندازی را شروع کنید.' };

  const step = verifyTotp(user.totp_secret, str(form, 'code', 10));
  if (step === null) {
    return {
      ok: false,
      errors: { code: 'کد درست نیست. ساعت گوشی و سرور باید هر دو خودکار تنظیم باشند.' },
    };
  }

  db.prepare('UPDATE users SET totp_enabled = 1, totp_last_step = ? WHERE id = ?').run(step, user.id);
  endAllSessions(user.id);
  await startSession(user.id, 'full');
  revalidatePath('/admin/security');

  return { ok: true, message: 'ورود دومرحله‌ای فعال شد.' };
}

export async function disableTotp(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireAdmin();

  if (!(await checkPassword(user.id, str(form, 'password', 200)))) {
    return { ok: false, errors: { password: 'رمز عبور درست نیست.' } };
  }

  db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_last_step = 0 WHERE id = ?').run(user.id);
  revalidatePath('/admin/security');
  redirect('/admin/security');
}
