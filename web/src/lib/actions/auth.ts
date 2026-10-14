'use server';

import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { verifyPassword, hashPassword } from '@/lib/crypto';
import { verifyTotp } from '@/lib/totp';
import {
  clearAttempts,
  clientIp,
  endSession,
  getSession,
  isLimited,
  recordAttempt,
  startSession,
} from '@/lib/session';

export type AuthState = { error?: string };

const WINDOW = 15 * 60 * 1000;
const LOCKED = 'تلاش‌های ناموفق زیادی ثبت شده است. ۱۵ دقیقه دیگر دوباره تلاش کنید.';

// A real hash to verify against when the email is unknown, so a missing
// account takes as long to reject as a wrong password — otherwise response
// time alone tells an attacker which emails exist.
let decoy: Promise<string> | undefined;

export async function login(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get('email') ?? '').trim().toLowerCase().slice(0, 120);
  const password = String(form.get('password') ?? '').slice(0, 200);
  const ip = await clientIp();

  // Two limits: per address+account stops guessing one password, per address
  // alone stops one machine spraying many accounts.
  const keys = [`login:${ip}:${email}`, `login-ip:${ip}`];
  if (isLimited(keys[0]!, 5, WINDOW) || isLimited(keys[1]!, 20, WINDOW)) {
    return { error: LOCKED };
  }

  const user = db.prepare('SELECT id, password_hash, totp_enabled FROM users WHERE email = ?').get(email) as
    | { id: number; password_hash: string; totp_enabled: number }
    | undefined;

  decoy ??= hashPassword('decoy-password-never-matches');
  const ok = await verifyPassword(password, user?.password_hash ?? (await decoy));

  if (!user || !ok) {
    recordAttempt(...keys);
    return { error: 'ایمیل یا رمز عبور اشتباه است.' };
  }

  clearAttempts(keys[0]!);

  if (user.totp_enabled) {
    await startSession(user.id, 'mfa');
    redirect('/admin/login/verify');
  }

  await startSession(user.id, 'full');
  redirect('/admin');
}

export async function verifyCode(_prev: AuthState, form: FormData): Promise<AuthState> {
  const session = await getSession();
  if (!session) redirect('/admin/login');
  if (session.stage === 'full') redirect('/admin');

  const { user } = session;
  const key = `totp:${user.id}`;

  if (isLimited(key, 5, WINDOW)) {
    return { error: LOCKED };
  }

  const step = user.totp_secret ? verifyTotp(user.totp_secret, String(form.get('code') ?? ''), user.totp_last_step) : null;

  if (step === null) {
    recordAttempt(key);
    return { error: 'کد وارد شده درست نیست. کد تازه را از برنامهٔ احراز هویت وارد کنید.' };
  }

  db.prepare('UPDATE users SET totp_last_step = ? WHERE id = ?').run(step, user.id);
  clearAttempts(key);

  // A fresh token for the full session: the half-authenticated one is
  // discarded rather than promoted.
  await endSession();
  await startSession(user.id, 'full');
  redirect('/admin');
}

export async function logout(): Promise<void> {
  await endSession();
  redirect('/admin/login');
}

