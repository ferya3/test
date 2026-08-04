import { prisma } from "@/lib/db";
import { setUserBlockedAction } from "@/app/actions/admin";
import { Card, PageHeader, formatDate } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Users" };

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { _count: { select: { buyerDeals: true, sellerDeals: true } } },
  });

  return (
    <div>
      <PageHeader title="Users" subtitle={`${users.length} accounts`} />
      <Card>
        <ul className="divide-y divide-slate-800">
          {users.map((user) => (
            <li key={user.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-200">
                  {user.displayName}
                  {user.role === "ADMIN" && (
                    <span className="ml-2 badge border-amber-500/40 bg-amber-500/10 text-amber-200">Admin</span>
                  )}
                  {user.isBlocked && (
                    <span className="ml-2 badge border-red-500/40 bg-red-500/10 text-red-200">Blocked</span>
                  )}
                </p>
                <p className="truncate text-xs text-slate-500">{user.email}</p>
              </div>
              <span className="text-xs text-slate-500">
                {user._count.buyerDeals} bought · {user._count.sellerDeals} sold
              </span>
              <span className="text-xs text-slate-500">
                {user.payoutAddress ? "payout set" : "no payout address"}
              </span>
              <span className="w-28 text-right text-xs text-slate-500">{formatDate(user.createdAt)}</span>
              <form action={setUserBlockedAction}>
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="blocked" value={String(!user.isBlocked)} />
                <SubmitButton className="btn btn-ghost">{user.isBlocked ? "Unblock" : "Block"}</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
