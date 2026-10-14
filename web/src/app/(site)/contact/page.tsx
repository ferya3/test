import type { Metadata } from 'next';
import { Clock, Mail, MapPin, Phone } from 'lucide-react';
import { LeadForm } from '@/components/catalog/lead-form';
import { Reveal } from '@/components/motion/reveal';
import { getSettings } from '@/lib/queries';

export const metadata: Metadata = {
  title: 'تماس با ما',
  description: 'استعلام قیمت، نمونهٔ رنگ و مشاورهٔ فنی صفحه کابینت و کامپکت اچ‌پی‌ال.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  const s = getSettings();
  const items = [
    { icon: Phone, label: 'تلفن', value: s.contact_phone, href: `tel:${s.contact_phone.replace(/[^\d+]/g, '')}`, ltr: true },
    { icon: Mail, label: 'ایمیل', value: s.contact_email, href: `mailto:${s.contact_email}`, ltr: true },
    { icon: MapPin, label: 'نشانی کارخانه', value: s.contact_address },
    { icon: Clock, label: 'ساعت کاری', value: 'شنبه تا پنجشنبه، ۸ تا ۱۷' },
  ];

  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="absolute -top-40 start-0 size-[34rem] rounded-full bg-gold-300/20 blur-[110px]" />
      <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-5 lg:gap-14 lg:px-8 lg:py-20">
        <Reveal className="lg:col-span-2">
          <p className="mb-3 text-sm font-bold text-gold-700">تماس با ما</p>
          <h1 className="text-h1 font-black text-balance text-ink-950">با ما در ارتباط باشید</h1>
          <p className="mt-4 text-lead text-ink-600">
            برای قیمت، نمونهٔ رنگ، سفارش پروژه یا مشاورهٔ فنی پیام بگذارید یا تماس بگیرید.
          </p>

          <ul className="mt-8 grid gap-3">
            {items.map(({ icon: Icon, label, value, href, ltr }) => {
              const body = (
                <>
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gold-400 text-ink-950">
                    <Icon className="size-5" />
                  </span>
                  <span>
                    <span className="block text-xs text-ink-500">{label}</span>
                    <span className={ltr ? 'ltr-isolate font-bold text-ink-950' : 'font-bold text-ink-950'}>{value}</span>
                  </span>
                </>
              );

              return (
                <li key={label}>
                  {href ? (
                    <a href={href} className="flex items-center gap-4 rounded-xl border border-ink-100 bg-white p-4 shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[var(--shadow-lift)]">
                      {body}
                    </a>
                  ) : (
                    <div className="flex items-center gap-4 rounded-xl border border-ink-100 bg-white p-4 shadow-[var(--shadow-soft)]">{body}</div>
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
