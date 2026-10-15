import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { AdminForm, Field } from '@/components/admin/form';
import { ImageInput } from '@/components/admin/inputs';
import { Input, Select, Textarea } from '@/components/ui/input';
import { requireAdmin } from '@/lib/session';
import { saveHero } from '@/lib/actions/content';
import { getCategories, getSettings } from '@/lib/queries';

export const metadata = { title: 'هیروی صفحهٔ اصلی' };

export default async function HeroPage() {
  await requireAdmin();
  const fa = getSettings('fa');
  // What the English site shows now: the saved English, or its built-in default.
  const en = getSettings('en');
  const categories = getCategories('fa');

  const targets = [
    { value: '', label: `گروه اول (${categories[0]?.name ?? '—'})` },
    ...categories.map((c) => ({ value: `/categories/${c.slug}`, label: `گروه: ${c.name}` })),
    { value: '/projects', label: 'نمونه کارها' },
    { value: '/about', label: 'دربارهٔ ما' },
    { value: '/contact', label: 'تماس' },
  ];

  const pair = 'grid gap-3 lg:grid-cols-2 lg:gap-5';

  return (
    <>
      <PageHeader
        title="هیروی صفحهٔ اصلی"
        description="اولین بخشی که بازدیدکننده می‌بیند."
        action={
          <Link href="/" target="_blank" className="flex h-11 items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 text-sm hover:border-ink-400">
            <ExternalLink className="size-4" />
            مشاهده
          </Link>
        }
      />

      <AdminForm action={saveHero} className="rounded-2xl bg-white p-5 shadow-[var(--shadow-soft)] sm:p-8">
        <fieldset className="grid gap-5 border-b border-ink-100 pb-6">
          <legend className="mb-4 text-h3 font-bold text-ink-950">متن‌ها</legend>
          <div className={pair}>
            <Field name="hero_overline" label="برچسب بالای عنوان">
              <Input id="hero_overline" name="hero_overline" defaultValue={fa.hero_overline} maxLength={120} />
            </Field>
            <Field name="hero_overline_en" label="برچسب — انگلیسی">
              <Input id="hero_overline_en" name="hero_overline_en" defaultValue={en.hero_overline} dir="ltr" maxLength={120} />
            </Field>
          </div>
          <div className={pair}>
            <Field name="hero_title" label="عنوان اصلی" hint="آخرین کلمه طلایی نمایش داده می‌شود.">
              <Input id="hero_title" name="hero_title" defaultValue={fa.hero_title} required maxLength={200} />
            </Field>
            <Field name="hero_title_en" label="عنوان — انگلیسی">
              <Input id="hero_title_en" name="hero_title_en" defaultValue={en.hero_title} dir="ltr" maxLength={200} />
            </Field>
          </div>
          <div className={pair}>
            <Field name="hero_lead" label="متن زیر عنوان">
              <Textarea id="hero_lead" name="hero_lead" defaultValue={fa.hero_lead} maxLength={600} className="min-h-28" />
            </Field>
            <Field name="hero_lead_en" label="متن — انگلیسی">
              <Textarea id="hero_lead_en" name="hero_lead_en" defaultValue={en.hero_lead} dir="ltr" maxLength={600} className="min-h-28" />
            </Field>
          </div>
        </fieldset>

        <fieldset className="grid gap-5 border-b border-ink-100 pb-6">
          <legend className="mb-4 text-h3 font-bold text-ink-950">دکمه‌ها</legend>
          <div className={pair}>
            <Field name="hero_cta_label" label="متن دکمهٔ اصلی">
              <Input id="hero_cta_label" name="hero_cta_label" defaultValue={fa.hero_cta_label} maxLength={60} />
            </Field>
            <Field name="hero_cta_label_en" label="متن دکمه — انگلیسی">
              <Input id="hero_cta_label_en" name="hero_cta_label_en" defaultValue={en.hero_cta_label} dir="ltr" maxLength={60} />
            </Field>
          </div>
          <div className={pair}>
            <Field name="hero_cta_href" label="دکمهٔ اصلی به کجا برود">
              <Select id="hero_cta_href" name="hero_cta_href" defaultValue={fa.hero_cta_href}>
                {targets.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <label className="flex items-center gap-2 self-end pb-3 text-sm">
              <input type="checkbox" name="hero_show_phone" defaultChecked={fa.hero_show_phone !== '0'} className="size-4 accent-gold-600" />
              نمایش دکمهٔ تماس تلفنی کنار دکمهٔ اصلی
            </label>
          </div>
        </fieldset>

        <fieldset className="grid gap-5">
          <legend className="mb-4 text-h3 font-bold text-ink-950">تصویر</legend>
          <Field
            name="image"
            label="عکس پس‌زمینه (اختیاری)"
            hint="عکس افقی و باکیفیت. با عکس، پشت متن تمام‌عرض نمایش داده می‌شود و با سایهٔ تیره خوانا می‌ماند. بدون عکس، ورق‌های سه‌بعدی نمایش داده می‌شوند."
          >
            <ImageInput name="image" current={fa.hero_image || null} />
          </Field>
        </fieldset>
      </AdminForm>
    </>
  );
}
