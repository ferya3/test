import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { DesktopNav, MenuButton, MobileMenu } from './navigation';
import { getSettings } from '@/lib/queries';

/** The brand mark: a gold monogram tile and the wordmark, both from settings. */
export function Brand({ name, light = false }: { name: string; light?: boolean }) {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label={`${name} — خانه`}>
      <span
        aria-hidden
        className="grid size-10 place-items-center rounded-lg bg-gradient-to-br from-gold-300 to-gold-500 text-lg font-black text-ink-950 shadow-[var(--shadow-gold)]"
      >
        {Array.from(name.trim())[0]}
      </span>
      <span className={light ? 'text-lg font-extrabold text-paper' : 'text-lg font-extrabold text-ink-950'}>
        {name}
      </span>
    </Link>
  );
}

export function Header() {
  const settings = getSettings();

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-ink-100/80 bg-paper/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:h-20 lg:px-8">
          <Brand name={settings.company_name} />
          <DesktopNav />

          <div className="flex items-center gap-2">
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link href="/contact">درخواست مشاوره</Link>
            </Button>
            <MenuButton />
          </div>
        </div>
      </header>

      <MobileMenu phone={settings.contact_phone} />
    </>
  );
}
