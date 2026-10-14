import { PageHeader } from '@/components/admin/page-header';
import { AdminForm, Field } from '@/components/admin/form';
import { Input, Textarea } from '@/components/ui/input';
import { requireAdmin } from '@/lib/session';
import { saveCategory } from '@/lib/actions/content';
import { db } from '@/lib/db';
import type { Category } from '@/lib/queries';

export const metadata = { title: 'گروه‌های کالا' };

export default async function CategoriesPage() {
  await requireAdmin();
  const categories = db.prepare('SELECT * FROM categories ORDER BY position, id').all() as Category[];

  return (
    <>
      <PageHeader title="گروه‌های کالا" description="نام و توضیحی که بالای صفحهٔ هر گروه دیده می‌شود." />
      <div className="grid gap-6">
        {categories.map((c) => (
          <AdminForm key={c.id} action={saveCategory.bind(null, c.id)} className="rounded-2xl bg-white p-5 shadow-[var(--shadow-soft)] sm:p-8">
            <p className="ltr-isolate text-xs text-ink-500">/categories/{c.slug}</p>
            <div className="grid gap-5 sm:grid-cols-[1fr_10rem]">
              <Field name="name" id={`name-${c.id}`} label="نام گروه">
                <Input id={`name-${c.id}`} name="name" defaultValue={c.name} required maxLength={120} />
              </Field>
              <Field name="position" id={`position-${c.id}`} label="ترتیب">
                <Input id={`position-${c.id}`} name="position" type="number" min={0} max={999} defaultValue={c.position} dir="ltr" />
              </Field>
            </div>
            <Field name="short" id={`short-${c.id}`} label="توضیح کوتاه (روی کارت صفحهٔ اصلی)">
              <Textarea id={`short-${c.id}`} name="short" defaultValue={c.short} maxLength={300} className="min-h-20" />
            </Field>
            <Field name="description" id={`description-${c.id}`} label="توضیح کامل (بالای صفحهٔ گروه)">
              <Textarea id={`description-${c.id}`} name="description" defaultValue={c.description} maxLength={3000} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_active" defaultChecked={!!c.is_active} className="size-4 accent-gold-600" />
              نمایش در سایت
            </label>
          </AdminForm>
        ))}
      </div>
    </>
  );
}
