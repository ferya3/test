import { PageHeader } from '@/components/admin/page-header';
import { AdminForm } from '@/components/admin/form';
import { SettingsFields, type SettingsGroup } from '@/components/admin/settings-fields';
import { requireAdmin } from '@/lib/session';
import { saveSettings } from '@/lib/actions/content';

export const metadata = { title: 'محتوای سایت' };

const GROUPS: SettingsGroup[] = [
  {
    title: 'شرکت',
    items: [
      { key: 'company_name', label: 'نام شرکت' },
      { key: 'company_tagline', label: 'شعار / معرفی یک‌خطی' },
      { key: 'founded_year', label: 'سال تأسیس (شمسی)', ltr: true, hint: 'برای شمارندهٔ «سال تجربه».' },
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
  {
    title: 'سئو — صفحهٔ اصلی در نتایج گوگل',
    items: [
      {
        key: 'seo_home_title',
        label: 'عنوان صفحهٔ اصلی',
        hint: 'تا ۶۰ نویسه؛ مهم‌ترین کلمه‌ای که مشتری جستجو می‌کند اول بیاید، نام شرکت آخر.',
      },
      { key: 'seo_home_description', label: 'توضیح صفحهٔ اصلی', long: true, hint: '۱۲۰ تا ۱۶۰ نویسه؛ چه می‌سازید و چرا شما.' },
      {
        key: 'google_site_verification',
        label: 'کد تأیید Google Search Console',
        ltr: true,
        hint: 'روش «HTML tag»: خود کد یا کل تگ meta را بچسبانید.',
      },
    ],
  },
];

export default async function SettingsPage() {
  await requireAdmin();

  return (
    <>
      <PageHeader title="محتوای سایت" description="نام شرکت، معرفی زیر هیرو، اطلاعات تماس و سئوی صفحهٔ اصلی. هیرو و بخش‌های صفحهٔ اصلی صفحهٔ خودشان را دارند." />
      <AdminForm action={saveSettings} className="rounded-2xl bg-white p-5 shadow-[var(--shadow-soft)] sm:p-8">
        <SettingsFields groups={GROUPS} />
      </AdminForm>
    </>
  );
}
