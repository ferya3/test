import { notFound } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { ProjectForm, type ProjectRow } from '@/components/admin/project-form';
import { ConfirmButton } from '@/components/admin/confirm-button';
import { requireAdmin } from '@/lib/session';
import { deleteProject } from '@/lib/actions/projects';
import { db } from '@/lib/db';
import type { Category } from '@/lib/queries';

export const metadata = { title: 'ویرایش نمونه کار' };

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number.parseInt((await params).id, 10);
  const project = Number.isFinite(id) ? (db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined) : undefined;
  if (!project) notFound();

  const categories = db.prepare('SELECT * FROM categories ORDER BY position, id').all() as Category[];

  return (
    <>
      <PageHeader
        title={project.title}
        action={
          <form action={deleteProject.bind(null, project.id)}>
            <ConfirmButton message="این نمونه کار برای همیشه حذف شود؟">
              <Trash2 className="size-4" />
              حذف
            </ConfirmButton>
          </form>
        }
      />
      <ProjectForm project={project} categories={categories} />
    </>
  );
}
