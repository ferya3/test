import { PageHeader } from '@/components/admin/page-header';
import { ProductForm } from '@/components/admin/product-form';
import { requireAdmin } from '@/lib/session';
import { db } from '@/lib/db';
import type { Category } from '@/lib/queries';

export const metadata = { title: 'محصول جدید' };

export default async function NewProductPage() {
  await requireAdmin();
  const categories = db.prepare('SELECT * FROM categories ORDER BY position, id').all() as Category[];

  return (
    <>
      <PageHeader title="محصول جدید" />
      <ProductForm categories={categories} />
    </>
  );
}
