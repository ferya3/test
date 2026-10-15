import Link from 'next/link';
import { Boxes, FolderPlus, Globe, ImagePlus, Inbox, PackagePlus, ShieldAlert, Sparkles, Star } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/session';
import { faDigits } from '@/lib/catalog';
import { siteUrl } from '@/lib/seo';

export default async function Dashboard() {
  const user = await requireAdmin();
  const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;

  const cards = [
    { label: 'محصولات فعال', value: n('SELECT COUNT(*) AS n FROM products WHERE is_active = 1'), icon: Boxes, href: '/admin/products' },
    { label: 'محصولات منتخب', value: n('SELECT COUNT(*) AS n FROM products WHERE is_featured = 1'), icon: Star, href: '/admin/products' },
    { label: 'پیام‌های خوانده‌نشده', value: n('SELECT COUNT(*) AS n FROM leads WHERE is_read = 0'), icon: Inbox, href: '/admin/leads' },
  ];

  const leads = db
    .prepare('SELECT id, name, phone, kind, created_at, is_read FROM leads ORDER BY id DESC LIMIT 5')
    .all() as { id: number; name: string; phone: string; kind: string; created_at: string; is_read: number }[];

  // Canonical links, the sitemap and share cards are all built from SITE_URL.
  // An IP address or plain http there is what search engines index.
  const site = siteUrl();
  const host = new URL(site).hostname;
  const siteProblem = !site.startsWith('https://')
    ? 'با http شروع می‌شود'
    : /^[\d.]+$|^localhost$/.test(host)
      ? 'دامنه نیست'
      : null;

  return (
    <>
      <PageHeader title={`سلام، ${user.name}`} description="خلاصهٔ وضعیت سایت" />

      {siteProblem && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-7 text-amber-900">
          <Globe className="mt-0.5 size-5 shrink-0" />
          <span>
            <b>نشانی سایت برای گوگل درست نیست:</b> <span className="ltr-isolate font-mono">{site}</span> {siteProblem}. لینک‌های اصلی
            (canonical) و نقشهٔ سایت از همین نشانی ساخته می‌شوند. روی سرور در فایل <span className="ltr-isolate font-mono">/etc/artavil-web.env</span>{' '}
            مقدار <span className="ltr-isolate font-mono">SITE_URL=https://دامنه</span> را بگذارید و سرویس را دوباره راه‌اندازی کنید.
          </span>
        </div>
      )}

      {!user.totp_enabled && (
        <Link
          href="/admin/security"
          className="mb-6 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <ShieldAlert className="mt-0.5 size-5 shrink-0" />
          <span>
            <b>ورود دومرحله‌ای فعال نیست.</b> برای امنیت پنل، آن را از بخش امنیت فعال کنید.
          </span>
        </Link>
      )}

      {/* The things done most often, one tap away. */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { href: '/admin/products/new', label: 'محصول جدید', icon: PackagePlus },
          { href: '/admin/categories/new', label: 'گروه کالای جدید', icon: FolderPlus },
          { href: '/admin/projects/new', label: 'نمونه کار جدید', icon: ImagePlus },
          { href: '/admin/hero', label: 'ویرایش هیرو', icon: Sparkles },
        ].map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-xl bg-ink-950 p-4 text-sm font-bold text-paper transition-colors hover:bg-ink-800"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-gold-400 text-ink-950">
              <Icon className="size-4.5" />
            </span>
            {label}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map(({ label, value, icon: Icon, href }) => (
          <Link key={label} href={href} className="rounded-2xl bg-white p-5 shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[var(--shadow-lift)]">
            <Icon className="size-5 text-gold-700" />
            <p className="mt-4 text-3xl font-black text-ink-950">{faDigits(value)}</p>
            <p className="text-sm text-ink-600">{label}</p>
          </Link>
        ))}
      </div>

      <section className="mt-8 rounded-2xl bg-white p-5 shadow-[var(--shadow-soft)] sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-h3 font-bold text-ink-950">آخرین پیام‌ها</h2>
          <Link href="/admin/leads" className="text-sm font-bold text-gold-700 hover:underline">
            همه
          </Link>
        </div>
        {leads.length === 0 ? (
          <p className="text-ink-500">هنوز پیامی نرسیده است.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {leads.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="flex items-center gap-2">
                  {!l.is_read && <span className="size-2 rounded-full bg-red-600" aria-label="خوانده‌نشده" />}
                  <b className="text-ink-900">{l.name}</b>
                  <span className="text-ink-500">{l.kind === 'quote' ? 'استعلام قیمت' : 'تماس'}</span>
                </span>
                <span className="ltr-isolate text-ink-600">{l.phone}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
