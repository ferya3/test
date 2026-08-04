import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatUsdt } from "@/lib/money";
import { Card, Empty, PageHeader, formatDate } from "@/components/ui";

export const metadata = { title: "Users" };

const PAGE_SIZE = 40;

const FILTERS = [
  { key: "all", label: "All" },
  { key: "funded", label: "With balance" },
  { key: "admins", label: "Admins" },
  { key: "blocked", label: "Blocked" },
];

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string; page?: string }>;
}) {
  const { q, filter = "all", page = "1" } = await searchParams;
  const pageNumber = Math.max(1, Number(page) || 1);

  const where = {
    ...(q ? { OR: [{ email: { contains: q } }, { displayName: { contains: q } }] } : {}),
    ...(filter === "admins" ? { role: "ADMIN" } : {}),
    ...(filter === "blocked" ? { isBlocked: true } : {}),
    ...(filter === "funded" ? { balanceMicro: { gt: 0n } } : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageNumber - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { _count: { select: { buyerDeals: true, sellerDeals: true } } },
    }),
    prisma.user.count({ where }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const query = (overrides: Record<string, string | number>) => {
    const params = new URLSearchParams({ filter, ...(q ? { q } : {}) });
    for (const [key, value] of Object.entries(overrides)) params.set(key, String(value));
    return `/admin/users?${params}`;
  };

  return (
    <div>
      <PageHeader title="Users" subtitle={`${total} account${total === 1 ? "" : "s"}`} />

      <form className="mb-4 flex flex-wrap gap-2" action="/admin/users">
        <input
          name="q"
          className="input max-w-xs"
          placeholder="Search name or email…"
          defaultValue={q ?? ""}
          aria-label="Search users"
        />
        <input type="hidden" name="filter" value={filter} />
        <button className="btn btn-ghost" type="submit">
          Search
        </button>
      </form>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <Link
            key={option.key}
            href={query({ filter: option.key, page: 1 })}
            className={`badge ${
              filter === option.key
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
                : "border-slate-700 bg-slate-800/40 text-slate-400"
            }`}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <Card>
        {users.length === 0 ? (
          <Empty title="No accounts match that search" />
        ) : (
          <ul className="divide-y divide-slate-800">
            {users.map((user) => (
              <li key={user.id}>
                <Link
                  href={`/admin/users/${user.id}`}
                  className="flex flex-wrap items-center gap-3 py-3 hover:opacity-90"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 truncate font-medium text-slate-200">
                      {user.displayName}
                      {user.role === "ADMIN" && (
                        <span className="badge border-amber-500/40 bg-amber-500/10 text-amber-200">Admin</span>
                      )}
                      {user.isBlocked && (
                        <span className="badge border-red-500/40 bg-red-500/10 text-red-200">Blocked</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-slate-500">{user.email}</p>
                  </div>

                  <span className="text-right">
                    <span
                      className={`block text-sm font-semibold ${
                        user.balanceMicro > 0n ? "text-emerald-300" : "text-slate-500"
                      }`}
                    >
                      {formatUsdt(user.balanceMicro)} USDT
                    </span>
                    <span className="text-[11px] text-slate-600">balance</span>
                  </span>

                  <span className="w-32 text-right text-xs text-slate-500">
                    {user._count.buyerDeals} bought · {user._count.sellerDeals} sold
                  </span>
                  <span className="w-28 text-right text-xs text-slate-500">{formatDate(user.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Page {pageNumber} of {pageCount}
          </span>
          <div className="flex gap-2">
            {pageNumber > 1 && (
              <Link className="btn btn-ghost" href={query({ page: pageNumber - 1 })}>
                Previous
              </Link>
            )}
            {pageNumber < pageCount && (
              <Link className="btn btn-ghost" href={query({ page: pageNumber + 1 })}>
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
