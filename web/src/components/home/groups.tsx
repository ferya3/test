import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Reveal } from '@/components/motion/reveal';
import { Tilt } from '@/components/motion/tilt';
import { SectionHeading } from '@/components/site/section-heading';
import { faDigits } from '@/lib/catalog';
import type { CategoryWithStats } from '@/lib/queries';

/** The two product groups, as two large cards — the main road into the catalogue. */
export function Groups({ categories }: { categories: CategoryWithStats[] }) {
  return (
    <section className="bg-ink-50 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading overline="گروه‌های کالا" title="دو محصول، یک استاندارد" />
        </Reveal>

        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:mt-14 lg:gap-8">
          {categories.map((category, i) => (
            <Reveal key={category.id} delay={i * 0.1} className="h-full">
              <Tilt max={4} className="h-full rounded-2xl">
                <Link
                  href={`/categories/${category.slug}`}
                  className="relative flex h-full flex-col overflow-hidden rounded-2xl bg-ink-950 text-paper shadow-[var(--shadow-lift)]"
                >
                  {/* A fanned stack of this group's real colours, lit from above. */}
                  <div aria-hidden className="relative h-56 overflow-hidden sm:h-72">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgb(212_168_83/0.28),transparent_65%)]" />
                    <div className="absolute inset-x-0 top-10 mx-auto h-52 w-36 sm:top-12 sm:h-64 sm:w-44">
                      {category.swatches.map((color, j, all) => {
                        const offset = j - (all.length - 1) / 2;

                        return (
                          <span
                            key={j}
                            className="absolute inset-0 rounded-lg border border-white/10 shadow-[0_20px_40px_-12px_rgb(0_0_0/0.6)] transition-transform duration-700 ease-[var(--ease-out-expo)]"
                            style={{
                              backgroundColor: color,
                              transform: `translateX(${offset * 34}px) translateY(${Math.abs(offset) * 10}px) rotate(${offset * 7}deg)`,
                              transformOrigin: '50% 120%',
                              zIndex: 10 - Math.abs(Math.round(offset)),
                            }}
                          />
                        );
                      })}
                    </div>
                    <div className="absolute inset-x-0 bottom-0 z-20 h-28 bg-gradient-to-t from-ink-950 via-ink-950/70 to-transparent" />
                  </div>

                  <div className="relative flex flex-1 flex-col p-6 pt-2 sm:p-8 sm:pt-2">
                    <p className="text-sm text-gold-300">{faDigits(category.product_count)} طرح و رنگ</p>
                    <h3 className="mt-2 text-h3 font-black sm:text-h2">{category.name}</h3>
                    <p className="mt-3 max-w-md text-ink-300">{category.short}</p>
                    <span className="mt-auto inline-flex items-center gap-2 pt-6 font-bold text-gold-300 transition-[gap] duration-300 group-hover:gap-3">
                      مشاهدهٔ محصولات
                      <ArrowLeft className="size-4" />
                    </span>
                  </div>
                </Link>
              </Tilt>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
