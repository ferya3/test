import { PageHeader } from '@/components/admin/page-header';
import { ProjectForm } from '@/components/admin/project-form';
import { requireAdmin } from '@/lib/session';
import { db } from '@/lib/db';
import type { Category } from '@/lib/queries';

export const metadata = { title: 'نمونه کار جدید' };

export default async function NewProjectPage() {
  await requireAdmin();
  const categories = db.prepare('SELECT * FROM categories ORDER BY position, id').all() as Category[];

  return (
    <>
      <PageHeader title="نمونه کار جدید" />
      <ProjectForm categories={categories} />
    </>
  );
}
