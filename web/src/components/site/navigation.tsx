'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, X, Phone } from 'lucide-react';
import { useEffect } from 'react';
import { useMenu } from '@/store/menu';
import { lenis } from '@/components/providers/smooth-scroll';
import { NAV } from '@/lib/nav';
import { cn } from '@/lib/utils';

export function MenuButton() {
  const { open, toggle } = useMenu();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={open}
      aria-controls="mobile-menu"
      aria-label={open ? 'بستن منو' : 'باز کردن منو'}
      className="grid size-11 place-items-center rounded-lg text-ink-900 transition-colors hover:bg-ink-50 lg:hidden"
    >
      {open ? <X className="size-6" /> : <Menu className="size-6" />}
    </button>
  );
}

export function DesktopNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="منوی اصلی" className="hidden lg:block">
      <ul className="flex items-center gap-1">
        {NAV.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative rounded-lg px-3.5 py-2 text-sm font-medium transition-colors',
                  active ? 'text-ink-950' : 'text-ink-600 hover:text-ink-950',
                )}
              >
                {item.label}
                {active && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-gold-500"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function MobileMenu({ phone }: { phone: string }) {
  const { open, setOpen } = useMenu();
  const pathname = usePathname();

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
          aria-label="منو"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-x-0 top-16 bottom-0 z-40 bg-paper/97 backdrop-blur-xl lg:hidden"
        >
          <nav className="flex h-full flex-col px-6 pt-8 pb-10">
            <ul className="flex flex-col gap-1">
              {NAV.map((item, i) => (
                <motion.li
                  key={item.href}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 + i * 0.05, ease: [0.16, 1, 0.3, 1], duration: 0.5 }}
                >
                  <Link
                    href={item.href}
                    className="block rounded-xl px-4 py-4 text-2xl font-bold text-ink-900 transition-colors hover:bg-ink-50"
                  >
                    {item.label}
                  </Link>
                </motion.li>
              ))}
            </ul>

            <a
              href={`tel:${phone.replace(/[^\d+]/g, '')}`}
              className="mt-auto flex items-center justify-center gap-2 rounded-xl bg-gold-400 py-4 text-base font-bold text-ink-950"
            >
              <Phone className="size-5" />
              <span className="ltr-isolate">{phone}</span>
            </a>
          </nav>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
