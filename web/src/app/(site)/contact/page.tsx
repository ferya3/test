import type { Metadata } from 'next';
import { Clock, Mail, MapPin, Phone } from 'lucide-react';
import { LeadForm } from '@/components/catalog/lead-form';
import { Reveal } from '@/components/motion/reveal';
import { getSettings } from '@/lib/queries';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'تماس با ما',
  description: 'استعلام قیمت، نمونهٔ رنگ و مشاورهٔ فنی صفحه کابینت و کامپکت اچ‌پی‌ال.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  const s = getSettings();
  const items = [
    { icon: Phone, label: 'تلفن', value: s.contact_phone, href: `tel:${s.contact_phone.replace(/[^\d+]/g, '')}`, ltr: true, half: true },
    { icon: Mail, label: 'ایمیل', value: s.contact_email, href: `mailto:${s.contact_email}`, ltr: true, half: true },
    { icon: MapPin, label: 'نشانی کارخانه', value: s.contact_address },
    { icon: Clock, label: 'ساعت کاری', value: 'شنبه تا پنجشنبه، ۸ تا ۱۷' },
  ];

  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="absolute -top-40 start-0 size-[34rem] rounded-full bg-gold-300/20 blur-[110px]" />
      <div className="relative mx-auto grid max-w-7xl gap-8 px-4 py-6 sm:gap-10 sm:px-6 sm:py-16 lg:grid-cols-5 lg:gap-14 lg:px-8 lg:py-20">
        <Reveal className="lg:col-span-2">
          <p className="mb-3 text-sm font-bold text-gold-700">تماس با ما</p>
          <h1 className="text-h1 font-black text-balance text-ink-950">با ما در ارتباط باشید</h1>
          <p className="mt-3 text-ink-600 sm:mt-4 sm:text-lead">
            برای قیمت، نمونهٔ رنگ، سفارش پروژه یا مشاورهٔ فنی پیام بگذارید یا تماس بگیرید.
          </p>

          <ul className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 lg:grid-cols-1">
            {items.map(({ icon: Icon, label, value, href, ltr, half }) => {
              const body = (
                <>
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gold-400 text-ink-950">
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs text-ink-500">{label}</span>
                    <span className={cn('block font-bold text-ink-950', ltr && 'ltr-isolate', half && 'truncate text-sm sm:text-base')}>{value}</span>
                  </span>
                </>
              );

              return (
                <li key={label} className={half ? undefined : 'col-span-2 lg:col-span-1'}>
                  {href ? (
                    <a
                      href={href}
                      // Phone and email side by side on a phone, as two big tap tiles.
                      className={cn(
                        'flex h-full gap-3 rounded-xl border border-ink-100 bg-white p-3 shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[var(--shadow-lift)] sm:gap-4 sm:p-4',
                        half ? 'flex-col items-start sm:flex-row sm:items-center lg:flex-row' : 'items-center',
                      )}
                    >
                      {body}
                    </a>
                  ) : (
                    <div className="flex items-center gap-3 rounded-xl border border-ink-100 bg-white p-3 shadow-[var(--shadow-soft)] sm:gap-4 sm:p-4">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Reveal>

        <Reveal delay={0.1} className="rounded-2xl border border-ink-100 bg-white p-5 shadow-[var(--shadow-lift)] sm:p-8 lg:col-span-3">
          <h2 className="mb-6 text-h3 font-bold text-ink-950">فرم تماس</h2>
          <LeadForm kind="contact" />
        </Reveal>
      </div>
    </section>
  );
}
