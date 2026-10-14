import { Reveal } from '@/components/motion/reveal';
import { Counter } from '@/components/motion/counter';

/** The company introduction under the hero — every word of it editable in the admin. */
export function Intro({
  overline,
  heading,
  body,
  stats,
}: {
  overline: string;
  heading: string;
  body: string;
  stats: { value: number; suffix?: string; label: string }[];
}) {
  return (
    <section className="relative py-20 sm:py-28">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:gap-16 lg:px-8">
        <Reveal className="lg:col-span-7">
          <p className="mb-3 text-sm font-bold tracking-wide text-gold-700">{overline}</p>
          <h2 className="text-h2 font-black text-balance text-ink-950">{heading}</h2>
          <div className="mt-6 space-y-4 text-lead text-ink-600">
            {body
              .split(/\n\s*\n/)
              .filter(Boolean)
              .map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
          </div>
        </Reveal>

        <div className="grid grid-cols-2 gap-3 self-center sm:gap-4 lg:col-span-5">
          {stats.map((stat, i) => (
            <Reveal
              key={stat.label}
              delay={i * 0.08}
              className={
                i === 0
                  ? 'col-span-2 rounded-2xl bg-ink-950 p-6 text-paper sm:p-8'
                  : 'rounded-2xl border border-ink-100 bg-white p-5 shadow-[var(--shadow-soft)] sm:p-6'
              }
            >
              <p className={i === 0 ? 'gold-text text-5xl font-black sm:text-6xl' : 'text-3xl font-black text-ink-950 sm:text-4xl'}>
                <Counter value={stat.value} suffix={stat.suffix} />
              </p>
              <p className={i === 0 ? 'mt-2 text-ink-300' : 'mt-1 text-sm text-ink-600'}>{stat.label}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
