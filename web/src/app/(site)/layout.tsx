import { SmoothScroll } from '@/components/providers/smooth-scroll';
import { Header } from '@/components/site/header';
import { Footer } from '@/components/site/footer';

/**
 * Boxed layout: from `lg` up the whole site sits in a centred box on a quiet
 * backdrop. On phones and tablets it stays edge to edge — margins there would
 * only take width away from the content.
 *
 * The box clips with `overflow: clip`, not `hidden`: `hidden` would make it a
 * scroll container, and the sticky header and filter bar would stop sticking.
 * It must also never get a transform or filter, which would break the
 * `position: fixed` the pinned production section relies on.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <SmoothScroll>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-ink-950 focus:px-4 focus:py-2 focus:text-paper"
      >
        پرش به محتوا
      </a>
      <div className="site-box">
        <Header />
        <main id="main" className="overflow-x-clip">
          {children}
        </main>
        <Footer />
      </div>
    </SmoothScroll>
  );
}
