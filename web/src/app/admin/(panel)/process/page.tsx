import { PageHeader } from '@/components/admin/page-header';
import { AdminForm, Field } from '@/components/admin/form';
import { ImageInput } from '@/components/admin/inputs';
import { Input, Textarea } from '@/components/ui/input';
import { requireAdmin } from '@/lib/session';
import { saveProcessStep } from '@/lib/actions/content';
import { getProcessSteps } from '@/lib/queries';
import { faDigits } from '@/lib/catalog';

export const metadata = { title: 'فرآیند تولید' };

export default async function ProcessPage() {
  await requireAdmin();
  const steps = getProcessSteps();

  return (
    <>
      <PageHeader
        title="فرآیند تولید"
        description="پنج کارت «از کاغذ تا ورق» در صفحهٔ اصلی و دربارهٔ ما. تا وقتی عکسی نگذارید، یک تصویرسازی نمایش داده می‌شود."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        {steps.map((step, i) => (
          <AdminForm key={step.id} action={saveProcessStep.bind(null, step.id)} className="rounded-2xl bg-white p-5 shadow-[var(--shadow-soft)] sm:p-6">
            <p className="text-sm font-bold text-gold-700">مرحلهٔ {faDigits(i + 1)}</p>
            <Field name="title" id={`title-${step.id}`} label="عنوان">
              <Input id={`title-${step.id}`} name="title" defaultValue={step.title} required maxLength={80} />
            </Field>
            <Field name="body" id={`body-${step.id}`} label="توضیح" hint="کوتاه بنویسید؛ روی عکس نمایش داده می‌شود.">
              <Textarea id={`body-${step.id}`} name="body" defaultValue={step.body} maxLength={400} className="min-h-24" />
            </Field>
            <Field name="image" id={`image-${step.id}`} label="عکس" hint="عکس عمودی بهتر است؛ متن روی پایین عکس می‌نشیند.">
              <ImageInput name="image" id={`image-${step.id}`} current={step.image} />
            </Field>
          </AdminForm>
        ))}
      </div>
    </>
  );
}
