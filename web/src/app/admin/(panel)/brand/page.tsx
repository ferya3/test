import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { AdminForm, Field } from '@/components/admin/form';
import { ImageInput } from '@/components/admin/inputs';
import { requireAdmin } from '@/lib/session';
import { saveBrand } from '@/lib/actions/content';
import { getSettings } from '@/lib/queries';

export const metadata = { title: 'لوگو و آیکن' };

export default async function BrandPage() {
  await requireAdmin();
  const s = getSettings();

  return (
    <>
      <PageHeader
        title="لوگو و آیکن"
        description="لوگوی بالای سایت و فوتر، و آیکنی که در تب مرورگر و صفحهٔ اصلی موبایل دیده می‌شود. نام شرکت در «محتوای سایت»."
        action={
          <Link href="/" target="_blank" className="flex h-11 items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 text-sm hover:border-ink-400">
            <ExternalLink className="size-4" />
            مشاهده
          </Link>
        }
      />
      <AdminForm action={saveBrand} className="grid gap-6 rounded-2xl bg-white p-5 shadow-[var(--shadow-soft)] sm:p-8">
        <Field
          name="logo"
          label="لوگو"
          hint="بالای همهٔ صفحه‌ها، روی زمینهٔ روشن. PNG با پس‌زمینهٔ شفاف بهترین است. بدون لوگو، نشان آرتاویل (مثلث و G) کنار نام شرکت نشان داده می‌شود."
        >
          <ImageInput name="logo" current={s.logo || null} recommended="افقی با ارتفاع دست‌کم ۲۰۰ پیکسل؛ مثل ۸۰۰ × ۲۰۰، PNG شفاف" />
        </Field>

        <Field
          name="logo_dark"
          label="لوگو برای زمینهٔ تیره (فوتر) — اختیاری"
          hint="نسخهٔ روشن یا سفید لوگو برای فوتر تیره. خالی بماند، همان لوگوی اصلی استفاده می‌شود."
        >
          <ImageInput name="logo_dark" current={s.logo_dark || null} recommended="همان اندازهٔ لوگوی اصلی، PNG شفاف" />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="brand_show_name" defaultChecked={s.brand_show_name !== '0'} className="size-4 accent-gold-600" />
          نام شرکت کنار لوگو نوشته شود (اگر نام داخل خود لوگو هست، تیک را بردارید)
        </label>

        <Field
          name="site_icon"
          label="آیکن سایت (favicon)"
          hint="در تب مرورگر، بوک‌مارک‌ها و وقتی سایت به صفحهٔ اصلی گوشی اضافه شود. یک نشانهٔ ساده و پررنگ؛ نوشته در این اندازه خوانده نمی‌شود."
        >
          <ImageInput name="site_icon" current={s.site_icon || null} recommended="۵۱۲ × ۵۱۲ پیکسل (مربع)، PNG" />
        </Field>
      </AdminForm>
    </>
  );
}
