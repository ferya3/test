import Link from 'next/link';
import { Mail, MailOpen, Phone, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { ConfirmButton } from '@/components/admin/confirm-button';
import { requireAdmin } from '@/lib/session';
import { deleteLead, setLeadRead } from '@/lib/actions/content';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';

export const metadata = { title: 'پیام‌ها' };

type Lead = {
  id: number;
  kind: string;
  name: string;
  phone: string;
  email: string;
  message: string;
  product_slug: string | null;
  product_name: string | null;
  is_read: number;
  created_at: string;
};

const date = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' });

export default async function LeadsPage() {
  await requireAdmin();
  const leads = db
    .prepare(
      `SELECT l.*, p.name AS product_name FROM leads l LEFT JOIN products p ON p.slug = l.product_slug
        ORDER BY l.is_read, l.id DESC LIMIT 200`,
    )
    .all() as Lead[];

  return (
    <>
      <PageHeader title="پیام‌ها" description="درخواست‌های فرم تماس و استعلام قیمت." />

      {leads.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-ink-500 shadow-[var(--shadow-soft)]">هنوز پیامی نرسیده است.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3">
          {leads.map((l) => (
            <li key={l.id} className={cn('rounded-2xl bg-white p-5 shadow-[var(--shadow-soft)]', !l.is_read && 'ring-2 ring-gold-400')}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-ink-950">
                    {l.name}
                    <span className="ms-2 rounded-full bg-ink-50 px-2 py-0.5 text-xs font-medium text-ink-600">
                      {l.kind === 'quote' ? 'استعلام قیمت' : 'تماس'}
                    </span>
                  </p>
                  {/* SQLite stores UTC without a zone marker. */}
                  <p className="mt-0.5 text-xs text-ink-500">{date.format(new Date(`${l.created_at.replace(' ', 'T')}Z`))}</p>
                </div>
                <div className="flex gap-1">
                  <form action={setLeadRead.bind(null, l.id, !l.is_read)}>
                    <button type="submit" className="grid size-10 place-items-center rounded-lg text-ink-600 hover:bg-ink-50" aria-label={l.is_read ? 'علامت خوانده‌نشده' : 'علامت خوانده‌شده'}>
                      {l.is_read ? <Mail className="size-4.5" /> : <MailOpen className="size-4.5" />}
                    </button>
                  </form>
                  <form action={deleteLead.bind(null, l.id)}>
                    <ConfirmButton message="این پیام حذف شود؟">
                      <Trash2 className="size-4" />
                    </ConfirmButton>
                  </form>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <a href={`tel:${l.phone.replace(/[^\d+]/g, '')}`} className="ltr-isolate flex items-center gap-1.5 text-ink-800 hover:text-gold-700">
                  <Phone className="size-4" />
                  {l.phone}
                </a>
                {l.email && (
                  <a href={`mailto:${l.email}`} className="ltr-isolate text-ink-800 hover:text-gold-700">
                    {l.email}
                  </a>
                )}
                {l.product_slug && (
                  <Link href={`/products/${l.product_slug}`} target="_blank" className="text-gold-700 hover:underline">
                    {l.product_name ?? l.product_slug}
                  </Link>
                )}
              </div>
              {l.message && <p className="mt-3 rounded-lg bg-ink-50 p-3 text-sm leading-7 whitespace-pre-line text-ink-800">{l.message}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
