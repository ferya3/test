import Link from 'next/link';
import { ArrowLeft, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/motion/reveal';

export function Cta({ phone }: { phone: string }) {
  return (
    <section className="px-4 pb-20 sm:px-6 sm:pb-28 lg:px-8">
      <Reveal className="relative mx-auto max-w-7xl overflow-hidden rounded-2xl bg-ink-950 px-6 py-14 text-center text-paper sm:px-12 sm:py-20">
        <div aria-hidden className="absolute -top-1/2 left-1/2 size-[40rem] -translate-x-1/2 rounded-full bg-gold-500/20 blur-[110px]" />
        <div className="relative">
          <h2 className="text-h1 font-black text-balance">
            پروژهٔ بعدی‌تان را <span className="gold-text">با ما</span> بسازید
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lead text-ink-300">
            برای قیمت، نمونهٔ رنگ یا مشاورهٔ فنی، فرم را پر کنید یا تماس بگیرید. همکاران فروش در اولین فرصت پاسخ می‌دهند.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/contact">
                درخواست مشاوره
                <ArrowLeft />
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghostLight">
              <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}>
                <Phone />
                <span className="ltr-isolate">{phone}</span>
              </a>
            </Button>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
