import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-ink-950 px-4 text-center text-paper">
      <div>
        <p className="gold-text text-[8rem] leading-none font-black">۴۰۴</p>
        <h1 className="mt-4 text-h2 font-black">این صفحه پیدا نشد</h1>
        <p className="mt-3 text-ink-300">ممکن است نشانی اشتباه باشد یا صفحه جابه‌جا شده باشد.</p>
        <Button asChild size="lg" className="mt-8">
          <Link href="/">بازگشت به خانه</Link>
        </Button>
      </div>
    </main>
  );
}
