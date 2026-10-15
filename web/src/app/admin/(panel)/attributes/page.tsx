import { Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { AdminForm, Field } from '@/components/admin/form';
import { ConfirmButton } from '@/components/admin/confirm-button';
import { Input, Select } from '@/components/ui/input';
import { requireAdmin } from '@/lib/session';
import { addAttribute, deleteAttribute, saveAttribute, saveAttributeVisibility } from '@/lib/actions/attributes';
import { attributeUsage, attributeVisibility, getAttributes, type AttributeKind } from '@/lib/attributes';
import { TEXTURES, faDigits } from '@/lib/catalog';

export const metadata = { title: 'طرح، سطح، ضخامت' };

const SECTIONS: { kind: AttributeKind; title: string; lead: string }[] = [
  { kind: 'family', title: 'طرح‌ها', lead: 'مثل چوبی، سنگی، تک‌رنگ. «نقش نمونه» تعیین می‌کند محصولِ بدون عکس با چه بافتی کشیده شود.' },
  { kind: 'surface', title: 'سطح‌ها', lead: 'مثل های‌گلاس، مات، سوپرمات.' },
  { kind: 'thickness', title: 'ضخامت‌ها', lead: 'به میلی‌متر. خودکار از کم به زیاد مرتب می‌شوند.' },
];

function TextureSelect({ id, value }: { id: string; value?: string }) {
  return (
    <Select id={id} name="texture" defaultValue={value ?? 'solid'}>
      {Object.entries(TEXTURES).map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </Select>
  );
}

export default async function AttributesPage() {
  await requireAdmin();
  const visible = attributeVisibility();

  return (
    <>
      <PageHeader
        title="طرح، سطح، ضخامت"
        description="گزینه‌های فیلتر بالای محصولات و فرم محصول. موردی که محصولی از آن استفاده می‌کند حذف نمی‌شود."
      />

      {/* On/off for the whole site: filters, product cards and product pages. */}
      <AdminForm action={saveAttributeVisibility} submitLabel="ذخیره" className="mb-8 rounded-2xl bg-white p-5 shadow-[var(--shadow-soft)] sm:p-6">
        <h2 className="text-h3 font-bold text-ink-950">نمایش در سایت</h2>
        <p className="-mt-2 text-sm text-ink-600">
          هر کدام را خاموش کنید، از فیلترها، کارت محصولات و صفحهٔ محصول برداشته می‌شود و در فرم محصول اختیاری می‌شود. مقدارهای ثبت‌شدهٔ محصولات
          پاک نمی‌شوند؛ با روشن کردن دوباره همه برمی‌گردند.
        </p>
        <div className="flex flex-wrap gap-3">
          {SECTIONS.map(({ kind, title }) => (
            <label
              key={kind}
              className="flex h-12 cursor-pointer items-center gap-3 rounded-xl border border-ink-200 px-4 text-sm font-bold has-checked:border-gold-500 has-checked:bg-gold-50"
            >
              <input type="checkbox" name={`show_${kind}`} defaultChecked={visible[kind]} className="size-4 accent-gold-600" />
              {title}
            </label>
          ))}
        </div>
      </AdminForm>

      <div className="grid gap-8">
        {SECTIONS.map(({ kind, title, lead }) => {
          const rows = getAttributes(kind);
          if (kind === 'thickness') rows.sort((a, b) => Number(a.value) - Number(b.value));

          return (
            <section key={kind} className="rounded-2xl bg-white p-5 shadow-[var(--shadow-soft)] sm:p-6">
              <h2 className="flex items-center gap-2 text-h3 font-bold text-ink-950">
                {title}
                {!visible[kind] && <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-bold text-ink-600">خاموش در سایت</span>}
              </h2>
              <p className="mt-1 mb-5 text-sm text-ink-600">{lead}</p>

              <ul className="grid gap-3">
                {rows.map((a) => {
                  const used = attributeUsage(kind, a.value);

                  return (
                    <li key={a.id} className="rounded-xl border border-ink-100 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm">
                          <b className="text-ink-950">{kind === 'thickness' ? `${faDigits(a.value)} میلی‌متر` : a.name}</b>
                          <span className="ltr-isolate ms-2 font-mono text-xs text-ink-400">{a.value}</span>
                          <span className="ms-2 text-xs text-ink-500">· {faDigits(used)} محصول</span>
                        </p>
                        <form action={deleteAttribute.bind(null, a.id)}>
                          {used > 0 ? (
                            <span className="text-xs text-ink-400" title="ابتدا محصولات را به مورد دیگری منتقل کنید">
                              در حال استفاده
                            </span>
                          ) : (
                            <ConfirmButton message="این مورد حذف شود؟">
                              <Trash2 className="size-4" />
                              حذف
                            </ConfirmButton>
                          )}
                        </form>
                      </div>

                      {kind !== 'thickness' && (
                        <AdminForm action={saveAttribute.bind(null, a.id)} submitLabel="ذخیره" className="gap-3">
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <Field name="name" id={`name-${a.id}`} label="نام">
                              <Input id={`name-${a.id}`} name="name" defaultValue={a.name} required maxLength={60} />
                            </Field>
                            <Field name="name_en" id={`name_en-${a.id}`} label="نام انگلیسی">
                              <Input id={`name_en-${a.id}`} name="name_en" defaultValue={a.name_en} dir="ltr" maxLength={60} />
                            </Field>
                            {kind === 'family' && (
                              <Field name="texture" id={`texture-${a.id}`} label="نقش نمونه">
                                <TextureSelect id={`texture-${a.id}`} value={a.texture} />
                              </Field>
                            )}
                            <Field name="position" id={`position-${a.id}`} label="ترتیب">
                              <Input id={`position-${a.id}`} name="position" type="number" min={0} max={999} defaultValue={a.position} dir="ltr" />
                            </Field>
                          </div>
                        </AdminForm>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/* Add a new one */}
              <div className="mt-5 rounded-xl border border-dashed border-gold-300 bg-gold-50/50 p-4">
                <p className="mb-3 text-sm font-bold text-gold-700">افزودن {title.replace(/‌?ها$/, '')}</p>
                <AdminForm action={addAttribute.bind(null, kind)} submitLabel="افزودن" className="gap-3">
                  {kind === 'thickness' ? (
                    <Field name="value" id={`new-${kind}-value`} label="ضخامت (میلی‌متر)">
                      <Input id={`new-${kind}-value`} name="value" inputMode="decimal" dir="ltr" maxLength={6} required placeholder="4" />
                    </Field>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Field name="name" id={`new-${kind}-name`} label="نام">
                        <Input id={`new-${kind}-name`} name="name" required maxLength={60} placeholder={kind === 'family' ? 'فانتزی' : 'براق آینه‌ای'} />
                      </Field>
                      <Field name="name_en" id={`new-${kind}-name_en`} label="نام انگلیسی">
                        <Input id={`new-${kind}-name_en`} name="name_en" dir="ltr" maxLength={60} placeholder={kind === 'family' ? 'Fantasy' : 'Mirror gloss'} />
                      </Field>
                      <Field name="value" id={`new-${kind}-value`} label="شناسه (اختیاری)" hint="در آدرس فیلتر می‌آید؛ خالی بماند از نام انگلیسی ساخته می‌شود.">
                        <Input id={`new-${kind}-value`} name="value" dir="ltr" maxLength={40} placeholder={kind === 'family' ? 'fantasy' : 'mirror-gloss'} />
                      </Field>
                      {kind === 'family' && (
                        <Field name="texture" id={`new-${kind}-texture`} label="نقش نمونه">
                          <TextureSelect id={`new-${kind}-texture`} />
                        </Field>
                      )}
                    </div>
                  )}
                </AdminForm>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
