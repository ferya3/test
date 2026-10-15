import Link from 'next/link';
import { ArrowLeft, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/motion/reveal';
import { getDictionary } from '@/i18n/dictionaries';
import { localePath, type Locale } from '@/i18n/config';

/** "Build *with us*": the words between stars in gold. */
function withGold(text: string) {
  return text.split(/\*([^*]+)\*/).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="gold-text">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export function Cta({ phone, locale, title, lead }: { phone: string; locale: Locale; title: string; lead: string }) {
  const t = getDictionary(locale).cta;

  return (
    <section className="px-4 pb-14 sm:px-6 sm:pb-20 lg:px-8 lg:pb-28">
      <Reveal className="relative mx-auto max-w-7xl overflow-hidden rounded-2xl bg-ink-950 px-5 py-10 text-center text-paper sm:px-12 sm:py-20">
        <div aria-hidden className="absolute -top-1/2 left-1/2 size-[40rem] -translate-x-1/2 rounded-full bg-[rgb(58_108_156/0.45)] blur-[110px]" />
        <div className="relative">
          <h2 className="text-h1 font-black text-balance">
            {withGold(title)}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lead text-ink-300">
            {lead}
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href={localePath(locale, '/contact')}>
                {t.consult}
                <ArrowLeft className="dir-icon" />
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
