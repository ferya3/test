import "server-only";
import { prisma } from "./db";
import type { Prisma } from "@/generated/prisma";

/**
 * Every movement on a user's balance goes through this module. Nothing else in
 * the codebase may write `User.balanceMicro` — that single rule is what makes
 * the ledger trustworthy, because each change is written together with the
 * entry that explains it, in one transaction.
 */

export type LedgerKind =
  | "MANUAL_CREDIT"
  | "MANUAL_DEBIT"
  | "DEAL_FUNDING"
  | "DEAL_PAYOUT"
  | "DEAL_REFUND"
  | "WITHDRAWAL"
  | "WITHDRAWAL_REVERSAL";

export const LEDGER_LABELS: Record<LedgerKind, string> = {
  MANUAL_CREDIT: "Manual credit",
  MANUAL_DEBIT: "Manual debit",
  DEAL_FUNDING: "Deal funded",
  DEAL_PAYOUT: "Deal payout",
  DEAL_REFUND: "Deal refund",
  WITHDRAWAL: "Withdrawal",
  WITHDRAWAL_REVERSAL: "Withdrawal returned",
};

export class LedgerError extends Error {}

export type PostEntryInput = {
  userId: string;
  /** Signed: positive credits the user, negative debits them. */
  amountMicro: bigint;
  kind: LedgerKind;
  note?: string | null;
  reference?: string | null;
  dealId?: string | null;
  actorId?: string | null;
};

/**
 * Applies one movement and records it. Runs inside the caller's transaction
 * when given one, so a deal state change and the money that goes with it
 * either both happen or neither does.
 */
export async function postEntry(
  input: PostEntryInput,
  tx?: Prisma.TransactionClient,
) {
  const run = async (client: Prisma.TransactionClient) => {
    if (input.amountMicro === 0n) {
      throw new LedgerError("A ledger entry cannot be for zero.");
    }

    const user = await client.user.findUnique({
      where: { id: input.userId },
      select: { balanceMicro: true },
    });
    if (!user) throw new LedgerError("No such user.");

    const balanceAfter = user.balanceMicro + input.amountMicro;
    // A negative balance would mean the platform had paid out money it never
    // held. Refuse rather than record an impossible state.
    if (balanceAfter < 0n) {
      throw new LedgerError("That would take the balance below zero.");
    }

    await client.user.update({
      where: { id: input.userId },
      data: { balanceMicro: balanceAfter },
    });

    return client.ledgerEntry.create({
      data: {
        userId: input.userId,
        amountMicro: input.amountMicro,
        balanceAfterMicro: balanceAfter,
        kind: input.kind,
        note: input.note ?? null,
        reference: input.reference ?? null,
        dealId: input.dealId ?? null,
        actorId: input.actorId ?? null,
      },
    });
  };

  return tx ? run(tx) : prisma.$transaction(run);
}

export async function getBalance(userId: string): Promise<bigint> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { balanceMicro: true },
  });
  return user?.balanceMicro ?? 0n;
}

/**
 * Recomputes every balance from its ledger history and reports the accounts
 * that disagree with their stored value. A clean result is the strongest
 * evidence the money side of the platform is behaving; anything listed here
 * means a write bypassed `postEntry`.
 */
export async function reconcile(): Promise<
  { userId: string; email: string; stored: bigint; computed: bigint }[]
> {
  const users = await prisma.user.findMany({ select: { id: true, email: true, balanceMicro: true } });
  const sums = await prisma.ledgerEntry.groupBy({
    by: ["userId"],
    _sum: { amountMicro: true },
  });
  const byUser = new Map(sums.map((row) => [row.userId, row._sum.amountMicro ?? 0n]));

  const drift: { userId: string; email: string; stored: bigint; computed: bigint }[] = [];
  for (const user of users) {
    const computed = byUser.get(user.id) ?? 0n;
    if (computed !== user.balanceMicro) {
      drift.push({ userId: user.id, email: user.email, stored: user.balanceMicro, computed });
    }
  }
  return drift;
}

/** Total balance the platform owes its users — what the treasury must cover. */
export async function totalLiability(): Promise<bigint> {
  const result = await prisma.user.aggregate({ _sum: { balanceMicro: true } });
  return result._sum.balanceMicro ?? 0n;
}
