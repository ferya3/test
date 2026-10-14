import { AdminForm, Field } from './form';
import { ColorInput, ImageInput } from './inputs';
import { Input, Select, Textarea } from '@/components/ui/input';
import { saveProject } from '@/lib/actions/projects';
import type { Category } from '@/lib/queries';

export type ProjectRow = {
  id: number;
  title: string;
  location: string;
  year: string;
  description: string;
  category_id: number | null;
  color_hex: string;
  image: string | null;
  position: number;
  is_active: number;
};

export function ProjectForm({ project, categories }: { project?: ProjectRow; categories: Category[] }) {
  const p = project;

  return (
    <AdminForm action={saveProject.bind(null, p?.id ?? null)} className="rounded-2xl bg-white p-5 shadow-[var(--shadow-soft)] sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="title" label="عنوان" className="sm:col-span-2">
          <Input id="title" name="title" defaultValue={p?.title} required maxLength={120} placeholder="آشپزخانهٔ مسکونی، ونک" />
        </Field>

        <Field name="location" label="محل (اختیاری)">
          <Input id="location" name="location" defaultValue={p?.location} maxLength={120} placeholder="تهران" />
        </Field>

        <Field name="year" label="سال اجرا (اختیاری)">
          <Input id="year" name="year" defaultValue={p?.year} maxLength={4} dir="ltr" inputMode="numeric" placeholder="1403" />
        </Field>

        <Field name="category_id" label="محصول به‌کاررفته">
          <Select id="category_id" name="category_id" defaultValue={p?.category_id ?? ''}>
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field name="position" label="ترتیب نمایش" hint="اولی در صفحهٔ اصلی بزرگ نمایش داده می‌شود.">
          <Input id="position" name="position" type="number" min={0} max={9999} defaultValue={p?.position ?? 0} dir="ltr" />
        </Field>

        <Field name="image" label="عکس پروژه" className="sm:col-span-2" hint="عکس افقی بهتر است. تا عکس نگذارید، یک تصویرسازی به رنگ زیر نمایش داده می‌شود.">
          <ImageInput name="image" current={p?.image ?? null} />
        </Field>

        <Field name="color_hex" label="رنگ ورق به‌کاررفته">
          <ColorInput name="color_hex" defaultValue={p?.color_hex ?? '#c49a6c'} />
        </Field>

        <label className="flex items-center gap-2 self-center text-sm">
          <input type="checkbox" name="is_active" defaultChecked={p ? !!p.is_active : true} className="size-4 accent-gold-600" />
          نمایش در سایت
        </label>

        <Field name="description" label="توضیحات" className="sm:col-span-2">
          <Textarea id="description" name="description" defaultValue={p?.description} maxLength={3000} />
        </Field>
      </div>
    </AdminForm>
  );
}
