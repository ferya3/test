import Link from 'next/link';
import { Tilt } from '@/components/motion/tilt';
import { Swatch } from './swatch';
import { FAMILIES, SURFACES, faDigits } from '@/lib/catalog';
import type { Product } from '@/lib/queries';

export function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  const thicknesses = product.thicknesses.split(',').filter(Boolean);

  return (
    <Tilt max={6} className="h-full rounded-xl">
      <Link
        href={`/products/${product.slug}`}
        className="flex h-full flex-col overflow-hidden rounded-xl border border-ink-100 bg-white shadow-[var(--shadow-soft)] transition-shadow duration-500 hover:shadow-[var(--shadow-lift)]"
      >
        <div className="aspect-[4/5] overflow-hidden">
          <Swatch
            color={product.color_hex}
            family={product.family}
            seed={product.id}
            image={product.image}
            alt={product.name}
            priority={priority}
            className="transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:scale-105"
          />
        </div>

        <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2 text-[0.7rem] text-ink-500 sm:text-xs">
            <span>{SURFACES[product.surface]}</span>
            <span className="ltr-isolate font-mono">{product.code}</span>
          </div>
          <h3 className="text-sm leading-6 font-bold text-ink-950 sm:text-base">{product.name}</h3>
          <p className="mt-auto text-[0.7rem] text-ink-500 sm:text-xs">
            {FAMILIES[product.family]} · {thicknesses.map(faDigits).join('، ')} میلی‌متر
          </p>
        </div>
      </Link>
    </Tilt>
  );
}
