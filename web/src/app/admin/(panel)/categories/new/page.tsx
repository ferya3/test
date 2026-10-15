import { PageHeader } from '@/components/admin/page-header';
import { CategoryForm } from '@/components/admin/category-form';
import { requireAdmin } from '@/lib/session';
import { db } from '@/lib/db';

export const metadata = { title: 'گروه جدید' };

export default async function NewCategoryPage() {
  await requireAdmin();
  // A new group goes after the existing ones unless moved.
  const { next } = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM categories').get() as { next: number };

  return (
    <>
      <PageHeader title="گروه کالای جدید" />
      <CategoryForm nextPosition={next} />
    </>
  );
}
