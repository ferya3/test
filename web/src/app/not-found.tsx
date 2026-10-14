import Link from 'next/link';
import { headers } from 'next/headers';
import { Button } from '@/components/ui/button';
import { getDictionary } from '@/i18n/dictionaries';
import { isLocale, localePath } from '@/i18n/config';
import { num } from '@/lib/catalog';

export default async function NotFound() {
  // The middleware tells us which language the missing page was asked for in.
  const header = (await headers()).get('x-locale');
  const locale = isLocale(header) ? header : 'fa';
  const t = getDictionary(locale).notFound;

  return (
    <main className="grid min-h-dvh place-items-center bg-ink-950 px-4 text-center text-paper">
      <div>
        <p className="gold-text text-[8rem] leading-none font-black">{num(404, locale)}</p>
        <h1 className="mt-4 text-h2 font-black">{t.title}</h1>
        <p className="mt-3 text-ink-300">{t.lead}</p>
        <Button asChild size="lg" className="mt-8">
          <Link href={localePath(locale, '/')}>{t.back}</Link>
        </Button>
      </div>
    </main>
  );
}
