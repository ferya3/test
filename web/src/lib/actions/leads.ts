'use server';

import { db } from '@/lib/db';
import { persianLetters } from '@/lib/validate';
import { clientIp, isLimited, recordAttempt } from '@/lib/session';
import { getDictionary } from '@/i18n/dictionaries';
import { isLocale } from '@/i18n/config';

export type LeadState = {
  ok: boolean;
  message?: string;
  errors?: Partial<Record<'name' | 'phone' | 'email' | 'message', string>>;
  values?: Record<string, string>;
};

/** Persian and Arabic-Indic digits to ASCII — phones are often typed on a Persian keyboard. */
const toLatinDigits = (s: string) =>
  s
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

const text = (form: FormData, key: string) => {
  const value = form.get(key);
  // ي and ك from an Arabic keyboard become ی and ک, so searches find them.
  return typeof value === 'string' ? persianLetters(value.trim()) : '';
};

/**
 * A contact or quote request from the public site.
 *
 * Never trust user input: every field is length-bounded and shape-checked
 * here, on the server, whatever the browser already checked. What is stored is
 * plain text — React escapes it when the admin inbox renders it, so markup in
 * a message is shown, never run. Server Actions also refuse cross-origin
 * posts, which is the CSRF protection for this form.
 */
export async function submitLead(_prev: LeadState, form: FormData): Promise<LeadState> {
  // A field real visitors never see. Bots that fill every input get a
  // success message and nothing is stored.
  // The reply speaks the language of the page the form was on.
  const lang = text(form, 'locale');
  const t = getDictionary(isLocale(lang) ? lang : 'fa').leads;

  if (text(form, 'website') !== '') {
    return { ok: true, message: t.sent };
  }

  const ip = await clientIp();
  const key = `lead:${ip}`;

  if (isLimited(key, 5, 60 * 60 * 1000)) {
    return { ok: false, message: t.tooMany };
  }

  const values = {
    name: text(form, 'name'),
    phone: toLatinDigits(text(form, 'phone')),
    email: text(form, 'email'),
    message: text(form, 'message'),
  };
  const kind = text(form, 'kind') === 'quote' ? 'quote' : 'contact';
  const productSlug = text(form, 'product');

  const errors: LeadState['errors'] = {};

  if (values.name.length < 2 || values.name.length > 80) errors.name = t.name;
  if (!/^\+?[\d\s-]{7,20}$/.test(values.phone)) errors.phone = t.phone;
  if (values.email && (values.email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))) {
    errors.email = t.email;
  }
  if (values.message.length > 2000) errors.message = t.messageTooLong;
  if (kind === 'contact' && values.message.length < 5) errors.message = t.messageMissing;

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, values };
  }

  // Only a product that exists is linked; anything else is dropped.
  const product =
    productSlug && /^[a-z0-9-]{1,120}$/.test(productSlug)
      ? (db.prepare('SELECT slug FROM products WHERE slug = ?').get(productSlug) as { slug: string } | undefined)
      : undefined;

  db.prepare('INSERT INTO leads (kind, name, phone, email, message, product_slug) VALUES (?, ?, ?, ?, ?, ?)').run(
    kind,
    values.name,
    values.phone,
    values.email,
    values.message,
    product?.slug ?? null,
  );
  recordAttempt(key);

  return { ok: true, message: t.sent };
}
