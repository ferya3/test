'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageSquareText, Phone } from 'lucide-react';
import { lenis } from '@/components/providers/smooth-scroll';
import { useLocale } from '@/i18n/client';

/**
 * The product page's two actions, kept within thumb's reach at the bottom of
 * a phone screen: ask for a price, or call. It steps aside while the quote
 * form or the footer is on screen, where it would only cover them.
 */
export function QuoteBar({ phone }: { phone: string }) {
  const [hidden, setHidden] = useState(true);
  const { t } = useLocale();

  useEffect(() => {
    const targets = [document.getElementById('quote'), document.querySelector('footer')].filter(Boolean) as Element[];
    const visible = new Set<Element>();
    // Shown only after the first scroll, not over the product photo on arrival.
    let scrolled = window.scrollY > 120;

    const update = () => setHidden(!scrolled || visible.size > 0);
    const observer = new IntersectionObserver((entries) => {
      for (const e of entries) (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target));
      update();
    });
    targets.forEach((t) => observer.observe(t));

    const onScroll = () => {
      if (!scrolled && window.scrollY > 120) {
        scrolled = true;
        update();
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  function toQuote() {
    const form = document.getElementById('quote');
    if (!form) return;
    if (lenis) lenis.scrollTo(form, { offset: -80 });
    else form.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <AnimatePresence>
      {!hidden && (
        <motion.div
          initial={{ y: '110%' }}
          animate={{ y: 0 }}
          exit={{ y: '110%' }}
          transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-ink-100 bg-paper/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden"
        >
          <button
            type="button"
            onClick={toQuote}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gold-400 font-bold text-ink-950"
          >
            <MessageSquareText className="size-5" />
            {t.product.priceInquiry}
          </button>
          <a
            href={`tel:${phone.replace(/[^\d+]/g, '')}`}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-ink-950 px-5 font-bold text-paper"
            aria-label={`${t.product.call}: ${phone}`}
          >
            <Phone className="size-5" />
            {t.product.call}
          </a>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
