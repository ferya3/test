'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronLeft, Globe, Menu, X, Phone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useMenu } from '@/store/menu';
import { lenis } from '@/components/providers/smooth-scroll';
import { useLocale } from '@/i18n/client';
import { switchLocalePath } from '@/i18n/config';
import { NAV } from '@/lib/nav';
import { cn } from '@/lib/utils';

/** Whether `href` (a path without language prefix) is the page being viewed. */
function useIsActive() {
  const pathname = usePathname();
  const { path } = useLocale();
  return (href: string) => {
    const target = path(href);
    return href === '/' ? pathname === target : pathname.startsWith(target);
  };
}

export function MenuButton() {
  const { open, toggle } = useMenu();
  const { t } = useLocale();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={open}
      aria-controls="mobile-menu"
      aria-label={open ? t.header.closeMenu : t.header.openMenu}
      className="grid size-11 place-items-center rounded-lg text-ink-900 transition-colors hover:bg-ink-50 lg:hidden"
    >
      {open ? <X className="size-6" /> : <Menu className="size-6" />}
    </button>
  );
}

/**
 * The same page in the other language, keeping the query string, so a
 * filtered product list stays filtered.
 */
export function LanguageSwitch({ className }: { className?: string }) {
  const { locale, t } = useLocale();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const other = locale === 'fa' ? 'en' : 'fa';

  // A plain link, not next/link: switching language must load a fresh
  // document. The root layout, which sets <html lang dir>, is not re-rendered
  // on client-side navigation, so the page would keep the old direction.
  return (
    <a
      href={`${switchLocalePath(pathname, other)}${search ? `?${search}` : ''}`}
      hrefLang={other}
      lang={other}
      aria-label={t.header.otherLanguageLabel}
      className={cn(
        'inline-flex h-10 items-center gap-1.5 rounded-lg border border-ink-200 px-3 text-sm font-bold text-ink-800 transition-colors hover:border-ink-900',
        className,
      )}
    >
      <Globe className="size-4" />
      {t.header.otherLanguageShort}
    </a>
  );
}

type Group = { slug: string; name: string };

/** The menu, in order: home, the product groups, then the fixed pages. */
function useMenuItems(groups: Group[]) {
  const { t } = useLocale();
  const [home, ...rest] = NAV;
  return {
    home: { href: home.href, label: t.nav[home.key] },
    groups: groups.map((g) => ({ href: `/categories/${g.slug}`, label: g.name })),
    rest: rest.map((item) => ({ href: item.href, label: t.nav[item.key] })),
  };
}

function NavLink({ href, label }: { href: string; label: string }) {
  const { path } = useLocale();
  const active = useIsActive()(href);

  return (
    <Link
      href={path(href)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors xl:px-3.5',
        active ? 'text-ink-950' : 'text-ink-600 hover:text-ink-950',
      )}
    >
      {label}
      {active && (
        <motion.span
          layoutId="nav-underline"
          className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-gold-500"
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        />
      )}
    </Link>
  );
}

/**
 * Up to two product groups sit in the bar as links; more than that fold into
 * a "Products" menu, so the header never overflows however many groups the
 * admin creates.
 */
function ProductsMenu({ items }: { items: { href: string; label: string }[] }) {
  const { t, path } = useLocale();
  const pathname = usePathname();
  const isActive = useIsActive();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLLIElement>(null);
  const active = items.some((i) => isActive(i.href));

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <li ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors xl:px-3.5',
          active ? 'text-ink-950' : 'text-ink-600 hover:text-ink-950',
        )}
      >
        {t.nav.products}
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="absolute start-0 top-full z-50 mt-2 w-64 rounded-xl border border-ink-100 bg-white p-2 shadow-[var(--shadow-lift)]"
          >
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={path(item.href)}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className="block rounded-lg px-3 py-2.5 text-sm text-ink-800 hover:bg-ink-50 aria-[current=page]:font-bold aria-[current=page]:text-ink-950"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
}

export function DesktopNav({ groups }: { groups: Group[] }) {
  const { t } = useLocale();
  const { home, groups: groupItems, rest } = useMenuItems(groups);

  return (
    <nav aria-label={t.header.mainNav} className="hidden lg:block">
      <ul className="flex items-center gap-1">
        <li>
          <NavLink {...home} />
        </li>
        {groupItems.length <= 2 ? (
          groupItems.map((item) => (
            <li key={item.href}>
              <NavLink {...item} />
            </li>
          ))
        ) : (
          <ProductsMenu items={groupItems} />
        )}
        {rest.map((item) => (
          <li key={item.href}>
            <NavLink {...item} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function MobileMenu({ phone, groups }: { phone: string; groups: Group[] }) {
  const { open, setOpen } = useMenu();
  const pathname = usePathname();
  const { t, path } = useLocale();
  const isActive = useIsActive();
  const { home, groups: groupItems, rest } = useMenuItems(groups);
  const items = [home, ...groupItems, ...rest];

  // Navigating closes the drawer — a link that leaves it open over the new
  // page looks like the tap did nothing.
  useEffect(() => setOpen(false), [pathname, setOpen]);

  // Freeze the page behind the drawer, and let Escape close it.
  useEffect(() => {
    if (!open) return;

    lenis?.stop();
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);

    return () => {
      lenis?.start();
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label={t.header.menu}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-x-0 top-16 bottom-0 z-40 bg-paper/97 backdrop-blur-xl lg:hidden"
        >
          <nav className="flex h-full flex-col overflow-y-auto px-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <ul className="flex flex-col gap-1">
              {items.map((item, i) => {
                const active = isActive(item.href);

                return (
                  <motion.li
                    key={item.href}
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 + i * 0.05, ease: [0.16, 1, 0.3, 1], duration: 0.5 }}
                  >
                    <Link
                      href={path(item.href)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center justify-between rounded-xl px-4 py-3.5 text-xl font-bold transition-colors',
                        active ? 'bg-ink-950 text-paper' : 'text-ink-900 active:bg-ink-100',
                      )}
                    >
                      {item.label}
                      <ChevronLeft className={cn('dir-icon size-5', active ? 'text-gold-300' : 'text-ink-300')} />
                    </Link>
                  </motion.li>
                );
              })}
            </ul>

            <div className="mt-auto flex gap-2 pt-6">
              <a
                href={`tel:${phone.replace(/[^\d+]/g, '')}`}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gold-400 py-4 text-base font-bold text-ink-950"
              >
                <Phone className="size-5" />
                <span className="ltr-isolate">{phone}</span>
              </a>
              <LanguageSwitch className="h-auto rounded-xl px-5 text-base" />
            </div>
          </nav>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
