import { Reveal } from '@/components/motion/reveal';
import { SectionHeading } from '@/components/site/section-heading';
import { ProductCard } from '@/components/catalog/product-card';
import type { Product } from '@/lib/queries';

export function Featured({ products }: { products: Product[] }) {
  if (products.length === 0) return null;

  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading overline="منتخب" title="طرح‌های پرطرفدار" lead="از هر دو گروه کالا؛ برای دیدن همه، گروه را باز کنید." />
        </Reveal>

        <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:mt-14">
          {products.map((product, i) => (
            <Reveal key={product.id} delay={(i % 3) * 0.08}>
              <ProductCard product={product} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
