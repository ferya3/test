import Link from 'next/link';
import { Eye, EyeOff, Pencil, Plus, Star } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';
import { Swatch } from '@/components/catalog/swatch';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/session';
import { toggleProduct } from '@/lib/actions/products';
import { type Category, type Product } from '@/lib/queries';
import { faDigits } from '@/lib/catalog';
import { attributeCatalog } from '@/lib/attributes';
import { cn } from '@/lib/utils';

type Props = { searchParams: Promise<{ q?: string; category?: string }> };

export default async function ProductsPage({ searchParams }: Props) {
  await requireAdmin();
  const { q = '', category = '' } = await searchParams;
  const categories = db.prepare('SELECT * FROM categories ORDER BY position, id').all() as Category[];
  const categoryId = Number.parseInt(category, 10);

  const clauses = ['1 = 1'];
  const params: (string | number)[] = [];
  if (q.trim()) {
    clauses.push('(name LIKE ? OR code LIKE ?)');
    const like = `%${q.trim().slice(0, 60).replace(/[%_]/g, '')}%`;
    params.push(like, like);
  }
  if (Number.isFinite(categoryId)) {
    clauses.push('category_id = ?');
    params.push(categoryId);
  }

  const products = db
    .prepare(`SELECT * FROM products WHERE ${clauses.join(' AND ')} ORDER BY category_id, position, id`)
    .all(...params) as Product[];
  const names = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const catalog = attributeCatalog('fa');

  return (
    <>
      <PageHeader
        title="محصولات"
        description={`${faDigits(products.length)} محصول`}
        action={
          <Button asChild>
            <Link href="/admin/products/new">
              <Plus />
              محصول جدید
            </Link>
          </Button>
        }
      />

      <form className="mb-5 flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="جست‌وجوی نام یا کد…"
          className="h-11 min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-4 text-sm focus-visible:border-gold-600 focus-visible:outline-none"
        />
        <select name="category" defaultValue={category} className="h-11 rounded-lg border border-ink-200 bg-white px-3 text-sm">
          <option value="">همهٔ گروه‌ها</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="dark">
          فیلتر
        </Button>
      </form>

      <ul className="grid grid-cols-1 gap-3">
        {products.map((p) => (
          <li
            key={p.id}
            className={cn('flex items-center gap-3 rounded-xl bg-white p-3 shadow-[var(--shadow-soft)] sm:gap-4', !p.is_active && 'opacity-60')}
          >
            <div className="size-14 shrink-0 overflow-hidden rounded-lg sm:size-16">
              <Swatch color={p.color_hex} texture={catalog.texture(p.family)} image={p.image} seed={p.id} alt="" sizes="64px" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 font-bold text-ink-950">
                {p.is_featured ? <Star className="size-4 shrink-0 fill-gold-400 text-gold-500" aria-label="منتخب" /> : null}
                <span className="truncate">{p.name}</span>
              </p>
              <p className="truncate text-xs text-ink-500">
                <span className="ltr-isolate font-mono">{p.code}</span> · {names[p.category_id]} · {catalog.family(p.family)} · {catalog.surface(p.surface)}
              </p>
            </div>
            <form action={toggleProduct.bind(null, p.id)}>
              <button
                type="submit"
                className="grid size-10 place-items-center rounded-lg text-ink-600 hover:bg-ink-50"
                aria-label={p.is_active ? 'پنهان کردن' : 'نمایش'}
                title={p.is_active ? 'پنهان کردن' : 'نمایش'}
              >
                {p.is_active ? <Eye className="size-4.5" /> : <EyeOff className="size-4.5" />}
              </button>
            </form>
            <Link href={`/admin/products/${p.id}`} className="grid size-10 place-items-center rounded-lg text-ink-600 hover:bg-ink-50" aria-label="ویرایش">
              <Pencil className="size-4.5" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
