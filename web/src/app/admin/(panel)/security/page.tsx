import { ShieldCheck, Smartphone } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { AdminForm, Field } from '@/components/admin/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { requireAdmin } from '@/lib/session';
import { beginTotp, changePassword, confirmTotp, disableTotp } from '@/lib/actions/security';
import { otpauthUri } from '@/lib/totp';
import { getSettings } from '@/lib/queries';

export const metadata = { title: 'امنیت' };

export default async function SecurityPage() {
  const user = await requireAdmin();
  const issuer = getSettings().company_name;
  const card = 'rounded-2xl bg-white p-5 shadow-[var(--shadow-soft)] sm:p-8';

  return (
    <>
      <PageHeader title="امنیت" />

      <div className="grid gap-6 xl:grid-cols-2">
        <section className={card}>
          <h2 className="mb-1 flex items-center gap-2 text-h3 font-bold text-ink-950">
            <ShieldCheck className="size-5 text-gold-700" />
            ورود دومرحله‌ای
          </h2>

          {user.totp_enabled ? (
            <>
              <p className="mb-6 text-sm text-green-700">فعال است. هر ورود به کد برنامهٔ احراز هویت نیاز دارد.</p>
              <AdminForm action={disableTotp} submitLabel="غیرفعال کردن">
                <Field name="password" label="برای غیرفعال کردن، رمز عبور را وارد کنید">
                  <Input id="password" name="password" type="password" dir="ltr" autoComplete="current-password" required />
                </Field>
              </AdminForm>
            </>
          ) : user.totp_secret ? (
            <>
              <ol className="mt-4 mb-6 list-inside list-decimal space-y-3 text-sm leading-7 text-ink-700">
                <li>
                  برنامهٔ Google Authenticator یا Microsoft Authenticator را باز کنید و «افزودن حساب» ← «وارد کردن کلید راه‌اندازی» را بزنید.
                </li>
                <li>
                  این کلید را وارد کنید (نوع: بر اساس زمان):
                  <code className="mt-2 block rounded-lg bg-ink-50 p-3 text-center font-mono text-base tracking-widest break-all text-ink-950" dir="ltr">
                    {user.totp_secret.match(/.{1,4}/g)?.join(' ')}
                  </code>
                </li>
                <li>
                  روی همین گوشی هستید؟{' '}
                  <a href={otpauthUri(user.totp_secret, user.email, issuer)} className="inline-flex items-center gap-1 font-bold text-gold-700 underline">
                    <Smartphone className="size-4" />
                    افزودن مستقیم به برنامه
                  </a>
                </li>
                <li>کد ۶ رقمی‌ای که برنامه نشان می‌دهد را وارد کنید.</li>
              </ol>
              <AdminForm action={confirmTotp} submitLabel="فعال‌سازی">
                <Field name="code" label="کد ۶ رقمی">
                  <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={7} className="text-center font-mono text-xl tracking-[0.4em]" required />
                </Field>
              </AdminForm>
            </>
          ) : (
            <>
              <p className="mt-2 mb-6 text-sm leading-7 text-ink-600">
                با فعال کردن این گزینه، ورود به پنل علاوه بر رمز عبور به کدی نیاز دارد که برنامهٔ احراز هویت روی گوشی شما هر ۳۰ ثانیه می‌سازد.
              </p>
              <form action={beginTotp}>
                <Button type="submit">شروع راه‌اندازی</Button>
              </form>
            </>
          )}
        </section>

        <section className={card}>
          <h2 className="mb-6 text-h3 font-bold text-ink-950">تغییر رمز عبور</h2>
          <AdminForm action={changePassword} submitLabel="تغییر رمز">
            <Field name="current" label="رمز فعلی">
              <Input id="current" name="current" type="password" dir="ltr" autoComplete="current-password" required />
            </Field>
            <Field name="next" label="رمز جدید" hint="دست‌کم ۱۲ نویسه.">
              <Input id="next" name="next" type="password" dir="ltr" autoComplete="new-password" minLength={12} required />
            </Field>
            <Field name="confirm" label="تکرار رمز جدید">
              <Input id="confirm" name="confirm" type="password" dir="ltr" autoComplete="new-password" required />
            </Field>
          </AdminForm>
        </section>
      </div>
    </>
  );
}
