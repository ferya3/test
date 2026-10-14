import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { ProductForm } from '@/components/admin/product-form';
import { ConfirmButton } from '@/components/admin/confirm-button';
import { requireAdmin } from '@/lib/session';
import { deleteProduct } from '@/lib/actions/products';
import { db } from '@/lib/db';
import type { Category, Product } from '@/lib/queries';

export const metadata = { title: 'ویرایش محصول' };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number.parseInt((await params).id, 10);
  const product = Number.isFinite(id) ? (db.prepare('SELECT * FROM products WHERE id = ?').get(id) as Product | undefined) : undefined;
  if (!product) notFound();

  const categories = db.prepare('SELECT * FROM categories ORDER BY position, id').all() as Category[];

  return (
    <>
      <PageHeader
        title={product.name}
        action={
          <div className="flex gap-2">
            <Link
              href={`/products/${product.slug}`}
              target="_blank"
              className="flex h-11 items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 text-sm hover:border-ink-400"
            >
              <ExternalLink className="size-4" />
              مشاهده
            </Link>
            <form action={deleteProduct.bind(null, product.id)}>
              <ConfirmButton message="این محصول برای همیشه حذف شود؟">
                <Trash2 className="size-4" />
                حذف
              </ConfirmButton>
            </form>
          </div>
        }
      />
      <ProductForm product={product} categories={categories} />
    </>
  );
}
