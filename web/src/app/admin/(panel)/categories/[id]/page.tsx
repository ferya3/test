import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { CategoryForm } from '@/components/admin/category-form';
import { ConfirmButton } from '@/components/admin/confirm-button';
import { requireAdmin } from '@/lib/session';
import { deleteCategory } from '@/lib/actions/content';
import { db } from '@/lib/db';
import { faDigits } from '@/lib/catalog';
import type { Category } from '@/lib/queries';

export const metadata = { title: 'ویرایش گروه' };

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number.parseInt((await params).id, 10);
  const category = Number.isFinite(id) ? (db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as Category | undefined) : undefined;
  if (!category) notFound();

  const { n: products } = db.prepare('SELECT COUNT(*) AS n FROM products WHERE category_id = ?').get(id) as { n: number };

  return (
    <>
      <PageHeader
        title={category.name}
        description={`${faDigits(products)} محصول در این گروه`}
        action={
          <div className="flex gap-2">
            <Link
              href={`/categories/${category.slug}`}
              target="_blank"
              className="flex h-11 items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 text-sm hover:border-ink-400"
            >
              <ExternalLink className="size-4" />
              مشاهده
            </Link>
            {products === 0 ? (
              <form action={deleteCategory.bind(null, category.id)}>
                <ConfirmButton message="این گروه حذف شود؟ نمونه کارهای آن بدون گروه می‌مانند.">
                  <Trash2 className="size-4" />
                  حذف
                </ConfirmButton>
              </form>
            ) : (
              <span className="flex h-11 items-center px-2 text-xs text-ink-500">برای حذف، ابتدا محصولاتش را منتقل یا حذف کنید.</span>
            )}
          </div>
        }
      />
      <CategoryForm category={category} />
    </>
  );
}
