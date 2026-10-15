import { AdminForm, Field } from './form';
import { ColorInput, ImageInput } from './inputs';
import { SeoFields } from './seo-fields';
import { seoValues } from './seo-values';
import { Input, Select, Textarea } from '@/components/ui/input';
import { saveProduct } from '@/lib/actions/products';
import { faDigits } from '@/lib/catalog';
import { attributeVisibility, getAttributes } from '@/lib/attributes';
import type { Category, Product } from '@/lib/queries';

export const EN_HINT = 'برای نسخهٔ انگلیسی سایت. اگر خالی بماند، متن فارسی نمایش داده می‌شود.';

export function ProductForm({ product, categories }: { product?: Product; categories: Category[] }) {
  const p = product;
  const thicknesses = p?.thicknesses.split(',') ?? [];
  const families = getAttributes('family');
  const surfaces = getAttributes('surface');
  const thicknessOptions = getAttributes('thickness').sort((a, b) => Number(a.value) - Number(b.value));
  const show = attributeVisibility();
  const off = ' — در سایت خاموش است (اختیاری)';

  return (
    <AdminForm action={saveProduct.bind(null, p?.id ?? null)} className="rounded-2xl bg-white p-5 shadow-[var(--shadow-soft)] sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="name" label="نام محصول" className="sm:col-span-2">
          <Input id="name" name="name" defaultValue={p?.name} required maxLength={120} />
        </Field>

        <Field name="name_en" label="نام محصول — انگلیسی" hint={EN_HINT} className="sm:col-span-2">
          <Input id="name_en" name="name_en" defaultValue={p?.name_en} dir="ltr" maxLength={120} placeholder="Natural Oak Embossed Cabinet Panel" />
        </Field>

        <Field name="code" label="کد محصول">
          <Input id="code" name="code" defaultValue={p?.code} dir="ltr" required maxLength={30} placeholder="AG-1023" />
        </Field>

        <Field name="slug" label="نشانی (اسلاگ)" hint="خالی بگذارید تا از کد ساخته شود.">
          <Input id="slug" name="slug" defaultValue={p?.slug} dir="ltr" maxLength={120} placeholder="natural-oak-18" />
        </Field>

        <Field name="category_id" label="گروه کالا">
          <Select id="category_id" name="category_id" defaultValue={p?.category_id}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field name="position" label="ترتیب نمایش" hint="عدد کوچک‌تر، جلوتر.">
          <Input id="position" name="position" type="number" min={0} max={9999} defaultValue={p?.position ?? 0} dir="ltr" />
        </Field>

        <Field
          name="family"
          label={`طرح${show.family ? '' : off}`}
          hint="فهرست طرح‌ها، سطح‌ها و ضخامت‌ها و روشن/خاموش بودنشان در «طرح، سطح، ضخامت»."
        >
          <Select id="family" name="family" defaultValue={p?.family}>
            {!show.family && <option value="">—</option>}
            {families.map((a) => (
              <option key={a.value} value={a.value}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field name="surface" label={`سطح${show.surface ? '' : off}`}>
          <Select id="surface" name="surface" defaultValue={p?.surface}>
            {!show.surface && <option value="">—</option>}
            {surfaces.map((a) => (
              <option key={a.value} value={a.value}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field name="thicknesses" label={`ضخامت‌ها (میلی‌متر)${show.thickness ? '' : off}`} className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {thicknessOptions.map(({ value: t }) => (
              <label
                key={t}
                className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-ink-200 px-4 text-sm has-checked:border-gold-500 has-checked:bg-gold-50"
              >
                <input type="checkbox" name="thicknesses" value={t} defaultChecked={thicknesses.includes(t)} className="size-4 accent-gold-600" />
                {faDigits(t)}
              </label>
            ))}
          </div>
        </Field>

        <Field name="color_hex" label="رنگ اصلی" hint="برای نمونهٔ رنگ وقتی عکس نیست.">
          <ColorInput name="color_hex" defaultValue={p?.color_hex ?? '#d9d2c8'} />
        </Field>

        <div className="flex flex-col justify-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_active" defaultChecked={p ? !!p.is_active : true} className="size-4 accent-gold-600" />
            نمایش در سایت
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_featured" defaultChecked={!!p?.is_featured} className="size-4 accent-gold-600" />
            منتخب (در صفحهٔ اصلی)
          </label>
        </div>

        <Field
          name="image"
          label="تصویر محصول"
          className="sm:col-span-2"
          hint="همین عکس روی کارت محصول (صفحهٔ اصلی و صفحهٔ گروه) و در صفحهٔ خود محصول می‌آید. بدون عکس، نمونهٔ رنگ و بافت کشیده می‌شود."
        >
          <ImageInput name="image" current={p?.image ?? null} recommended="۱۲۰۰ × ۱۲۰۰ پیکسل (مربع)، موضوع در ۸۰٪ وسط" />
        </Field>

        <Field name="short" label="توضیح کوتاه" className="sm:col-span-2">
          <Textarea id="short" name="short" defaultValue={p?.short} maxLength={300} className="min-h-20" />
        </Field>

        <Field name="short_en" label="توضیح کوتاه — انگلیسی" className="sm:col-span-2">
          <Textarea id="short_en" name="short_en" defaultValue={p?.short_en} dir="ltr" maxLength={300} className="min-h-20" />
        </Field>

        <Field name="description" label="توضیحات کامل" className="sm:col-span-2">
          <Textarea id="description" name="description" defaultValue={p?.description} maxLength={5000} className="min-h-40" />
        </Field>

        <Field name="description_en" label="توضیحات کامل — انگلیسی" className="sm:col-span-2">
          <Textarea id="description_en" name="description_en" defaultValue={p?.description_en} dir="ltr" maxLength={5000} className="min-h-40" />
        </Field>

        <SeoFields values={seoValues(p)} titleHint="خالی بماند: «نام محصول — گروه | نام شرکت»." />
      </div>
    </AdminForm>
  );
}
