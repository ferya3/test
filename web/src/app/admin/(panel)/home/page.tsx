import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { AdminForm } from '@/components/admin/form';
import { SettingsFields, type SettingsGroup } from '@/components/admin/settings-fields';
import { requireAdmin } from '@/lib/session';
import { saveSettings } from '@/lib/actions/content';

export const metadata = { title: 'بخش‌های صفحهٔ اصلی' };

const SHOW: [string, string][] = [
  ['1', 'نمایش'],
  ['0', 'پنهان'],
];

/** The home page from top to bottom, after the hero (which has its own page). */
const GROUPS: SettingsGroup[] = [
  {
    title: '۱. معرفی شرکت و آمار',
    description: 'متن این بخش در «محتوای سایت» ویرایش می‌شود.',
    items: [{ key: 'home_show_intro', label: 'نمایش بخش', options: SHOW }],
  },
  {
    title: '۲. کارت‌های گروه کالا',
    description:
      'عکس، نام و توضیح هر کارت از خود گروه می‌آید: گروه‌ها ← ویرایش گروه ← «عکس کارت گروه در صفحهٔ اصلی».',
    items: [
      { key: 'home_show_groups', label: 'نمایش بخش', options: SHOW },
      { key: 'home_groups_overline', label: 'برچسب بالای عنوان' },
      { key: 'home_groups_title', label: 'عنوان' },
    ],
  },
  {
    title: '۳. فرآیند تولید',
    description: 'کارت‌ها و عکس‌هایشان در «فرآیند تولید» ویرایش می‌شوند. این عنوان در صفحهٔ «دربارهٔ ما» هم می‌آید.',
    items: [
      { key: 'home_show_process', label: 'نمایش بخش', options: SHOW },
      { key: 'home_process_overline', label: 'برچسب بالای عنوان' },
      { key: 'home_process_title', label: 'عنوان' },
    ],
  },
  {
    title: '۴. محصولات منتخب',
    description:
      'کارت‌ها محصولاتی هستند که در فرم محصول «منتخب» زده شده‌اند؛ عکس هر کارت همان «تصویر محصول» است. ترتیب با «ترتیب نمایش» محصول.',
    items: [
      { key: 'home_show_featured', label: 'نمایش بخش', options: SHOW },
      {
        key: 'home_featured_count',
        label: 'تعداد کارت‌ها',
        options: [
          ['3', '۳ (یک ردیف)'],
          ['6', '۶ (دو ردیف)'],
          ['9', '۹ (سه ردیف)'],
          ['12', '۱۲ (چهار ردیف)'],
        ],
      },
      { key: 'home_featured_overline', label: 'برچسب بالای عنوان' },
      { key: 'home_featured_title', label: 'عنوان' },
      { key: 'home_featured_lead', label: 'توضیح', long: true },
    ],
  },
  {
    title: '۵. نمونه‌های اجرا شده',
    description: 'شش نمونه کار اول (به ترتیب نمایش) با عکس‌هایشان؛ در «نمونه کارها» ویرایش می‌شوند.',
    items: [
      { key: 'home_show_projects', label: 'نمایش بخش', options: SHOW },
      { key: 'home_projects_overline', label: 'برچسب بالای عنوان' },
      { key: 'home_projects_title', label: 'عنوان' },
      { key: 'home_projects_lead', label: 'توضیح', long: true },
    ],
  },
  {
    title: '۶. دعوت به تماس (پایین صفحه)',
    description: 'این بخش در صفحهٔ «دربارهٔ ما» هم می‌آید. شمارهٔ تلفن از «محتوای سایت».',
    items: [
      { key: 'home_show_cta', label: 'نمایش بخش', options: SHOW },
      { key: 'home_cta_title', label: 'عنوان', hint: 'کلماتی که بین دو ستاره بنویسید طلایی می‌شوند؛ مثل: پروژهٔ بعدی‌تان را *با ما* بسازید' },
      { key: 'home_cta_lead', label: 'توضیح', long: true },
    ],
  },
];

export default async function HomeSectionsPage() {
  await requireAdmin();

  return (
    <>
      <PageHeader
        title="بخش‌های صفحهٔ اصلی"
        description="عنوان‌ها و نمایش هر بخش، به ترتیبی که در صفحه می‌آیند. هیرو صفحهٔ خودش را دارد."
        action={
          <Link href="/" target="_blank" className="flex h-11 items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 text-sm hover:border-ink-400">
            <ExternalLink className="size-4" />
            مشاهده
          </Link>
        }
      />
      <AdminForm action={saveSettings} className="rounded-2xl bg-white p-5 shadow-[var(--shadow-soft)] sm:p-8">
        <SettingsFields groups={GROUPS} />
      </AdminForm>
    </>
  );
}
