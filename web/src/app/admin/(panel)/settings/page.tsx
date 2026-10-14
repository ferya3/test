import { PageHeader } from '@/components/admin/page-header';
import { AdminForm, Field } from '@/components/admin/form';
import { Input, Textarea } from '@/components/ui/input';
import { requireAdmin } from '@/lib/session';
import { saveSettings } from '@/lib/actions/content';
import { getSettings, TRANSLATED_SETTINGS, type SettingKey, type TranslatedSettingKey } from '@/lib/queries';

export const metadata = { title: 'محتوای سایت' };

type Item = { key: SettingKey; label: string; long?: boolean; ltr?: boolean; hint?: string };

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'شرکت',
    items: [
      { key: 'company_name', label: 'نام شرکت' },
      { key: 'company_tagline', label: 'شعار / معرفی یک‌خطی' },
      { key: 'founded_year', label: 'سال تأسیس (شمسی)', ltr: true, hint: 'برای شمارندهٔ «سال تجربه».' },
    ],
  },
  {
    title: 'بخش اول صفحهٔ اصلی',
    items: [
      { key: 'hero_overline', label: 'برچسب بالای عنوان' },
      { key: 'hero_title', label: 'عنوان اصلی', hint: 'آخرین کلمه طلایی نمایش داده می‌شود.' },
      { key: 'hero_lead', label: 'متن زیر عنوان', long: true },
    ],
  },
  {
    title: 'معرفی شرکت (زیر بخش اول)',
    items: [
      { key: 'intro_overline', label: 'برچسب' },
      { key: 'intro_heading', label: 'عنوان' },
      { key: 'intro_body', label: 'متن', long: true, hint: 'برای پاراگراف جدید یک خط خالی بگذارید.' },
    ],
  },
  {
    title: 'اطلاعات تماس',
    items: [
      { key: 'contact_phone', label: 'تلفن', ltr: true },
      { key: 'contact_email', label: 'ایمیل', ltr: true },
      { key: 'contact_address', label: 'نشانی' },
    ],
  },
];

export default async function SettingsPage() {
  await requireAdmin();
  const settings = getSettings();
  // What the English site shows now: the saved English, or its built-in default.
  const english = getSettings('en');

  return (
    <>
      <PageHeader title="محتوای سایت" description="متن‌هایی که در صفحهٔ اصلی و سراسر سایت دیده می‌شوند." />
      <AdminForm action={saveSettings} className="rounded-2xl bg-white p-5 shadow-[var(--shadow-soft)] sm:p-8">
        {GROUPS.map((group) => (
          <fieldset key={group.title} className="grid gap-5 border-b border-ink-100 pb-6 last-of-type:border-0">
            <legend className="mb-4 text-h3 font-bold text-ink-950">{group.title}</legend>
            {group.items.map((item) => {
              const translated = (TRANSLATED_SETTINGS as readonly string[]).includes(item.key);
              const enKey = `${item.key}_en`;

              return (
                <div key={item.key} className={translated ? 'grid gap-3 lg:grid-cols-2 lg:gap-5' : undefined}>
                  <Field name={item.key} label={item.label} hint={item.hint}>
                    {item.long ? (
                      <Textarea id={item.key} name={item.key} defaultValue={settings[item.key]} className="min-h-48" maxLength={6000} />
                    ) : (
                      <Input id={item.key} name={item.key} defaultValue={settings[item.key]} dir={item.ltr ? 'ltr' : undefined} maxLength={300} />
                    )}
                  </Field>

                  {/* The English version, beside it on wide screens. */}
                  {translated && (
                    <Field name={enKey} label={`${item.label} — انگلیسی`}>
                      {item.long ? (
                        <Textarea id={enKey} name={enKey} defaultValue={english[item.key as TranslatedSettingKey]} dir="ltr" className="min-h-48" maxLength={6000} />
                      ) : (
                        <Input id={enKey} name={enKey} defaultValue={english[item.key as TranslatedSettingKey]} dir="ltr" maxLength={300} />
                      )}
                    </Field>
                  )}
                </div>
              );
            })}
          </fieldset>
        ))}
      </AdminForm>
    </>
  );
}
