import type { CSSProperties } from 'react';
import type { Family } from '@/lib/catalog';
import { mediaUrl } from '@/lib/media';
import { cn } from '@/lib/utils';

/**
 * A product's face: its photograph if one has been uploaded, otherwise a
 * swatch drawn from its colour and decor family — grain for wood, veining for
 * stone, a weave for fabric, a clean sheen for solids. Close enough to the
 * real sheet to choose by until photography exists.
 */
export function Swatch({
  color,
  family,
  image,
  alt,
  className,
  sizes = '(min-width: 1024px) 25vw, 50vw',
  priority = false,
  seed = 1,
}: {
  color: string;
  family: Family;
  image?: string | null;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  /** Varies the generated texture; pass the product id. */
  seed?: number;
}) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- already a sized WebP from sharp
      <img
        src={mediaUrl(image)}
        alt={alt}
        sizes={sizes}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        className={cn('size-full object-cover', className)}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={alt}
      className={cn('relative size-full overflow-hidden', className)}
      style={{ backgroundColor: color }}
    >
      <div aria-hidden className="absolute inset-0" style={pattern(family, seed)} />
      {/* Light falling across a pressed surface. */}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-white/35 via-transparent to-black/15" />
    </div>
  );
}

/**
 * Surface textures from SVG noise (feTurbulence), as data URIs: stretched
 * fractal noise reads as wood grain, turbulence thresholded to thin dark
 * ridges reads as marble veining. A few hundred bytes each, nothing to fetch,
 * and allowed by the CSP's `img-src data:`. The seed varies the pattern from
 * one product to the next so a grid of oaks is not a grid of copies.
 */
const noise = (filter: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='500' preserveAspectRatio='none'><filter id='f' x='0' y='0' width='100%' height='100%'>${filter}</filter><rect width='100%' height='100%' filter='url(#f)'/></svg>`,
  )}")`;

function pattern(family: Family, seed: number): CSSProperties {
  const base: CSSProperties = { mixBlendMode: 'multiply', backgroundSize: '100% 100%' };

  switch (family) {
    case 'wood':
      return {
        ...base,
        opacity: 0.4,
        backgroundImage: noise(
          `<feTurbulence type='fractalNoise' baseFrequency='0.06 0.003' numOctaves='4' seed='${seed}'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.2 0 0 0 -0.9'/>`,
        ),
      };
    case 'stone':
      return {
        ...base,
        opacity: 0.4,
        backgroundImage: noise(
          `<feTurbulence type='turbulence' baseFrequency='0.007 0.012' numOctaves='4' seed='${seed}'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -6 0 0 0 0.85'/>`,
        ),
      };
    case 'fabric':
      return {
        ...base,
        opacity: 0.5,
        backgroundSize: 'auto',
        backgroundImage: [
          'repeating-linear-gradient(0deg, rgb(0 0 0 / 0.07) 0 1px, transparent 1px 4px)',
          'repeating-linear-gradient(90deg, rgb(0 0 0 / 0.07) 0 1px, transparent 1px 4px)',
        ].join(','),
      };
    case 'solid':
      return { backgroundImage: 'linear-gradient(160deg, rgb(255 255 255 / 0.18), transparent 40%)' };
  }
}
