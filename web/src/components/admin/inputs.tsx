'use client';

import { useEffect, useState } from 'react';
import { ImageUp } from 'lucide-react';
import { mediaUrl } from '@/lib/media';

/** A colour picker with its hex value beside it, both naming the same field. */
export function ColorInput({ name, defaultValue }: { name: string; defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);

  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        id={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-12 w-16 cursor-pointer rounded-lg border border-ink-300 bg-white p-1"
      />
      <input type="hidden" name={name} value={value} />
      <span className="ltr-isolate font-mono text-sm text-ink-700">{value}</span>
    </div>
  );
}

/**
 * The product photograph. The `accept` list is a convenience for the file
 * picker only — the server decodes every upload and is what actually decides.
 */
export function ImageInput({ name, current }: { name: string; current: string | null }) {
  const [preview, setPreview] = useState<string | null>(current ? mediaUrl(current) : null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => () => void (objectUrl && URL.revokeObjectURL(objectUrl)), [objectUrl]);

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="grid size-28 place-items-center overflow-hidden rounded-xl border border-dashed border-ink-300 bg-white">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="size-full object-cover" />
        ) : (
          <ImageUp className="size-8 text-ink-400" />
        )}
      </div>
      <div className="flex flex-col gap-2 text-sm">
        <input
          id={name}
          name={name}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const url = URL.createObjectURL(f);
            setObjectUrl(url);
            setPreview(url);
          }}
          className="text-sm file:me-3 file:rounded-lg file:border-0 file:bg-ink-950 file:px-4 file:py-2 file:text-paper"
        />
        {current && (
          <label className="flex items-center gap-2 text-ink-600">
            <input type="checkbox" name="remove_image" className="size-4 accent-gold-600" />
            حذف تصویر فعلی
          </label>
        )}
        <p className="text-xs text-ink-500">JPG، PNG، WebP یا AVIF تا ۶ مگابایت؛ خودکار به WebP تبدیل می‌شود.</p>
      </div>
    </div>
  );
}
