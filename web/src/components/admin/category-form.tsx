import { AdminForm, Field } from './form';
import { ImageInput } from './inputs';
import { SeoFields } from './seo-fields';
import { seoValues } from './seo-values';
import { Input, Select, Textarea } from '@/components/ui/input';
import { saveCategory } from '@/lib/actions/content';
import type { Category } from '@/lib/queries';

export function CategoryForm({ category, nextPosition = 0 }: { category?: Category; nextPosition?: number }) {
  const c = category;

  return (
    <AdminForm action={saveCategory.bind(null, c?.id ?? null)} className="rounded-2xl bg-white p-5 shadow-[var(--shadow-soft)] sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="name" label="نام گروه">
          <Input id="name" name="name" defaultValue={c?.name} required maxLength={120} placeholder="صفحه کابینت اچ‌پی‌ال" />
        </Field>
        <Field name="name_en" label="نام گروه — انگلیسی">
          <Input id="name_en" name="name_en" defaultValue={c?.name_en} dir="ltr" maxLength={120} placeholder="HPL Cabinet Panel" />
        </Field>

        <Field
          name="slug"
          label="نشانی (اسلاگ)"
          hint={c ? 'نشانی گروه بعد از ساخت تغییر نمی‌کند، چون لینک‌هایش پخش شده‌اند.' : 'حروف کوچک انگلیسی و خط تیره؛ مثل hpl-worktop'}
        >
          <Input id="slug" name="slug" defaultValue={c?.slug} dir="ltr" maxLength={60} required={!c} disabled={!!c} placeholder="hpl-worktop" />
        </Field>
        <Field name="position" label="ترتیب نمایش" hint="عدد کوچک‌تر، جلوتر — در منو و صفحهٔ اصلی.">
          <Input id="position" name="position" type="number" min={0} max={999} defaultValue={c?.position ?? nextPosition} dir="ltr" />
        </Field>

        <Field
          name="card_image"
          label="عکس کارت گروه در صفحهٔ اصلی"
          className="sm:col-span-2"
          hint="بالای کارت بزرگ این گروه در صفحهٔ اصلی. بدون عکس، رنگ‌های محصولات گروه به شکل بادبزن کشیده می‌شوند."
        >
          <ImageInput name="card_image" current={c?.card_image ?? null} recommended="۱۶۰۰ × ۱۰۰۰ پیکسل (۱۶:۱۰)، موضوع در وسط؛ کناره‌ها بسته به عرض صفحه بریده می‌شوند" />
        </Field>

        <Field name="image" label="عکس بالای صفحهٔ گروه" className="sm:col-span-2" hint="نوار پهن بالای صفحهٔ گروه، بدون نوشته روی آن؛ عنوان و توضیح زیر عکس می‌آیند.">
          <ImageInput name="image" current={c?.image ?? null} recommended="۱۸۰۰ × ۶۷۵ پیکسل (۸:۳)، موضوع در وسط" />
        </Field>

        <Field name="short" label="توضیح کوتاه (روی کارت صفحهٔ اصلی)">
          <Textarea id="short" name="short" defaultValue={c?.short} maxLength={300} className="min-h-20" />
        </Field>
        <Field name="short_en" label="توضیح کوتاه — انگلیسی">
          <Textarea id="short_en" name="short_en" defaultValue={c?.short_en} dir="ltr" maxLength={300} className="min-h-20" />
        </Field>

        <Field name="description" label="توضیح کامل (بالای صفحهٔ گروه)">
          <Textarea id="description" name="description" defaultValue={c?.description} maxLength={3000} />
        </Field>
        <Field name="description_en" label="توضیح کامل — انگلیسی">
          <Textarea id="description_en" name="description_en" defaultValue={c?.description_en} dir="ltr" maxLength={3000} />
        </Field>

        <Field name="scene" label="تصویرسازی نمونه کارهای بدون عکس">
          <Select id="scene" name="scene" defaultValue={c?.scene ?? 'kitchen'}>
            <option value="kitchen">آشپزخانه و کابینت</option>
            <option value="cubicles">کابین و پارتیشن</option>
          </Select>
        </Field>
        <label className="flex items-center gap-2 self-center text-sm">
          <input type="checkbox" name="is_active" defaultChecked={c ? !!c.is_active : true} className="size-4 accent-gold-600" />
          نمایش در سایت
        </label>

        <SeoFields values={seoValues(c)} titleHint="خالی بماند: «نام گروه | نام شرکت». بهتر است کلمه‌ای که مشتری جستجو می‌کند در آن باشد." />
      </div>
    </AdminForm>
  );
}
