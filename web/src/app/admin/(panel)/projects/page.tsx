import Link from 'next/link';
import { Eye, EyeOff, Pencil, Plus } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';
import { ProjectArt } from '@/components/illustrations';
import { requireAdmin } from '@/lib/session';
import { toggleProject } from '@/lib/actions/projects';
import { db } from '@/lib/db';
import { mediaUrl } from '@/lib/media';
import { faDigits } from '@/lib/catalog';
import { cn } from '@/lib/utils';

export const metadata = { title: 'نمونه کارها' };

type Row = { id: number; title: string; location: string; year: string; image: string | null; color_hex: string; is_active: number; category_slug: string | null; category_name: string | null; category_scene: string | null };

export default async function ProjectsAdminPage() {
  await requireAdmin();
  const projects = db
    .prepare(
      `SELECT p.id, p.title, p.location, p.year, p.image, p.color_hex, p.is_active, c.slug AS category_slug, c.name AS category_name, c.scene AS category_scene
         FROM projects p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.position, p.id`,
    )
    .all() as Row[];
  const withoutPhoto = projects.filter((p) => !p.image).length;

  return (
    <>
      <PageHeader
        title="نمونه کارها"
        description={`${faDigits(projects.length)} نمونه کار · شش تای اول در صفحهٔ اصلی`}
        action={
          <Button asChild>
            <Link href="/admin/projects/new">
              <Plus />
              نمونه کار جدید
            </Link>
          </Button>
        }
      />

      {withoutPhoto > 0 && (
        <p className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-7 text-amber-900">
          {faDigits(withoutPhoto)} نمونه کار عکس ندارد و با تصویرسازی نمایش داده می‌شود. نمونه‌های اولیه فقط کاربردهای رایج را
          توصیف می‌کنند؛ آن‌ها را با عکس و مشخصات پروژه‌های واقعی خودتان جایگزین یا حذف کنید.
        </p>
      )}

      <ul className="grid grid-cols-1 gap-3">
        {projects.map((p) => (
          <li key={p.id} className={cn('flex items-center gap-3 rounded-xl bg-white p-3 shadow-[var(--shadow-soft)] sm:gap-4', !p.is_active && 'opacity-60')}>
            <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg sm:h-16 sm:w-24">
              {p.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(p.image)} alt="" className="size-full object-cover" />
              ) : (
                <ProjectArt color={p.color_hex} scene={p.category_scene} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-ink-950">{p.title}</p>
              <p className="truncate text-xs text-ink-500">
                {[p.category_name, p.location, p.year && faDigits(p.year), !p.image && 'بدون عکس'].filter(Boolean).join(' · ')}
              </p>
            </div>
            <form action={toggleProject.bind(null, p.id)}>
              <button type="submit" className="grid size-10 place-items-center rounded-lg text-ink-600 hover:bg-ink-50" aria-label={p.is_active ? 'پنهان کردن' : 'نمایش'}>
                {p.is_active ? <Eye className="size-4.5" /> : <EyeOff className="size-4.5" />}
              </button>
            </form>
            <Link href={`/admin/projects/${p.id}`} className="grid size-10 place-items-center rounded-lg text-ink-600 hover:bg-ink-50" aria-label="ویرایش">
              <Pencil className="size-4.5" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
