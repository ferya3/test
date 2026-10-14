import { SmoothScroll } from '@/components/providers/smooth-scroll';
import { Header } from '@/components/site/header';
import { Footer } from '@/components/site/footer';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <SmoothScroll>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-ink-950 focus:px-4 focus:py-2 focus:text-paper"
      >
        پرش به محتوا
      </a>
      <Header />
      <main id="main" className="overflow-x-clip">
        {children}
      </main>
      <Footer />
    </SmoothScroll>
  );
}
