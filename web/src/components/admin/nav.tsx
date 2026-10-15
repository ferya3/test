'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Boxes, Factory, FolderTree, Images, Inbox, LayoutDashboard, LayoutList, Palette, Settings, ShieldCheck, Sparkles, Stamp } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/admin', label: 'داشبورد', icon: LayoutDashboard },
  { href: '/admin/hero', label: 'هیروی صفحهٔ اصلی', icon: Sparkles },
  { href: '/admin/home', label: 'بخش‌های صفحهٔ اصلی', icon: LayoutList },
  { href: '/admin/products', label: 'محصولات', icon: Boxes },
  { href: '/admin/categories', label: 'گروه‌ها', icon: FolderTree },
  { href: '/admin/attributes', label: 'طرح، سطح، ضخامت', icon: Palette },
  { href: '/admin/projects', label: 'نمونه کارها', icon: Images },
  { href: '/admin/process', label: 'فرآیند تولید', icon: Factory },
  { href: '/admin/leads', label: 'پیام‌ها', icon: Inbox },
  { href: '/admin/settings', label: 'محتوای سایت', icon: Settings },
  { href: '/admin/brand', label: 'لوگو و آیکن', icon: Stamp },
  { href: '/admin/security', label: 'امنیت', icon: ShieldCheck },
];

export function AdminNav({ unread }: { unread: number }) {
  const pathname = usePathname();

  return (
    // A scrolling row on a phone, a column in the sidebar from `lg` up.
    <nav aria-label="منوی مدیریت" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
      <ul className="flex gap-1 lg:flex-col">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);

          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
                  active ? 'bg-gold-400 text-ink-950' : 'text-ink-300 hover:bg-white/5 hover:text-paper',
                )}
              >
                <Icon className="size-4.5" />
                {label}
                {href === '/admin/leads' && unread > 0 && (
                  <span className="ms-auto rounded-full bg-red-600 px-1.5 text-xs text-white">{unread}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
