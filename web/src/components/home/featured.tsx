import { Reveal } from '@/components/motion/reveal';
import { SectionHeading } from '@/components/site/section-heading';
import { ProductCard } from '@/components/catalog/product-card';
import type { Product } from '@/lib/queries';

export function Featured({ products }: { products: Product[] }) {
  if (products.length === 0) return null;

  return (
    <section className="py-14 sm:py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading overline="منتخب" title="طرح‌های پرطرفدار" lead="از هر دو گروه کالا؛ برای دیدن همه، گروه را باز کنید." />
        </Reveal>

        {/* A swipeable row on phones — six tall cards stacked two by two would
            take three screens — and a grid from `md` up. */}
        <Reveal delay={0.1}>
          <ul className="-mx-4 mt-7 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mt-10 md:mx-0 md:grid md:grid-cols-3 md:gap-5 md:overflow-visible md:px-0 lg:mt-14">
            {products.map((product) => (
              <li key={product.id} className="w-[44vw] max-w-[13rem] shrink-0 snap-start md:w-auto md:max-w-none">
                <ProductCard product={product} />
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
