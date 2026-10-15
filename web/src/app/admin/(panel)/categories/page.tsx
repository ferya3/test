import Link from 'next/link';
import { ImageIcon, Pencil, Plus } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';
import { requireAdmin } from '@/lib/session';
import { db } from '@/lib/db';
import { mediaUrl } from '@/lib/media';
import { faDigits } from '@/lib/catalog';
import { cn } from '@/lib/utils';

export const metadata = { title: 'گروه‌های کالا' };

type Row = { id: number; slug: string; name: string; name_en: string; image: string | null; is_active: number; products: number };

export default async function CategoriesPage() {
  await requireAdmin();
  const rows = db
    .prepare(
      `SELECT c.id, c.slug, c.name, c.name_en, c.image, c.is_active,
              (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS products
         FROM categories c ORDER BY c.position, c.id`,
    )
    .all() as Row[];

  return (
    <>
      <PageHeader
        title="گروه‌های کالا"
        description="هر گروه یک صفحه در سایت، یک کارت در صفحهٔ اصلی و یک لینک در منو دارد."
        action={
          <Button asChild>
            <Link href="/admin/categories/new">
              <Plus />
              گروه جدید
            </Link>
          </Button>
        }
      />

      <ul className="grid grid-cols-1 gap-3">
        {rows.map((c) => (
          <li key={c.id}>
            <Link
              href={`/admin/categories/${c.id}`}
              className={cn(
                'flex items-center gap-4 rounded-xl bg-white p-3 shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[var(--shadow-lift)]',
                !c.is_active && 'opacity-60',
              )}
            >
              <span className="grid h-14 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-ink-100 text-ink-400">
                {c.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl(c.image)} alt="" className="size-full object-cover" />
                ) : (
                  <ImageIcon className="size-5" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-ink-950">{c.name}</span>
                <span className="block truncate text-xs text-ink-500">
                  <span className="ltr-isolate">/categories/{c.slug}</span> · {faDigits(c.products)} محصول
                  {!c.name_en && ' · بدون نام انگلیسی'}
                  {!c.is_active && ' · پنهان'}
                </span>
              </span>
              <Pencil className="size-4.5 shrink-0 text-ink-500" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
