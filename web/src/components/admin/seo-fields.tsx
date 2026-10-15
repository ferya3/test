'use client';

import { useState } from 'react';
import { Field } from './form';
import { Input, Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import type { SeoValues as Values } from './seo-values';

// What Google shows in full: a title up to about 60 characters, a description
// of about 120–160. Outside that it is cut, or too thin to say much.
const TITLE_MAX = 60;
const DESC = [120, 160] as const;

function Counter({ length, ok, warn }: { length: number; ok: boolean; warn: string }) {
  if (length === 0) return null;
  return (
    <span className={cn('text-xs tabular-nums', ok ? 'text-emerald-700' : 'text-amber-700')}>
      {length.toLocaleString('fa-IR')} نویسه{!ok && ` — ${warn}`}
    </span>
  );
}

function SeoPair({
  suffix,
  values,
  titleHint,
  ltr,
}: {
  suffix: '' | '_en';
  values: Values;
  titleHint: string;
  ltr?: boolean;
}) {
  const [title, setTitle] = useState(values[`seo_title${suffix}`] ?? '');
  const [desc, setDesc] = useState(values[`seo_description${suffix}`] ?? '');
  const label = suffix ? ' — انگلیسی' : '';
  const t = title.trim().length;
  const d = desc.trim().length;

  return (
    <>
      <Field name={`seo_title${suffix}`} label={`عنوان در گوگل${label}`} hint={titleHint}>
        <Input
          id={`seo_title${suffix}`}
          name={`seo_title${suffix}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          dir={ltr ? 'ltr' : undefined}
        />
        <Counter length={t} ok={t <= TITLE_MAX} warn={`بیش از ${TITLE_MAX.toLocaleString('fa-IR')}، در نتایج بریده می‌شود`} />
      </Field>
      <Field name={`seo_description${suffix}`} label={`توضیح در گوگل${label}`} hint="خالی بماند، از توضیحات خودِ صفحه ساخته می‌شود.">
        <Textarea
          id={`seo_description${suffix}`}
          name={`seo_description${suffix}`}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          maxLength={320}
          dir={ltr ? 'ltr' : undefined}
          className="min-h-20"
        />
        <Counter
          length={d}
          ok={d >= DESC[0] && d <= DESC[1]}
          warn={d < DESC[0] ? 'کوتاه است؛ ۱۲۰ تا ۱۶۰ بهتر است' : 'بلند است؛ در نتایج بریده می‌شود'}
        />
      </Field>
    </>
  );
}

/**
 * The title and description search engines show for a page, in both
 * languages, with a running count against the lengths shown in full. All
 * optional: left empty, the page builds them from its own content.
 */
export function SeoFields({ values, titleHint }: { values: Values; titleHint: string }) {
  return (
    <fieldset className="grid gap-5 rounded-xl border border-ink-100 bg-ink-50/60 p-4 sm:col-span-2 sm:grid-cols-2 sm:p-5">
      <legend className="px-1 text-sm font-bold text-ink-900">سئو — نمایش در نتایج جستجو (اختیاری)</legend>
      <SeoPair suffix="" values={values} titleHint={titleHint} />
      <SeoPair suffix="_en" values={values} titleHint="Left empty, built from the English name." ltr />
    </fieldset>
  );
}
