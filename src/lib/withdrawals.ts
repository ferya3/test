import "server-only";
import { prisma } from "./db";
import { postEntry, LedgerError } from "./ledger";
import { isValidAddress, type Network } from "./wallet";

export class WithdrawalError extends Error {}

export const WITHDRAWAL_LABELS: Record<string, string> = {
  REQUESTED: "Awaiting review",
  APPROVED: "Approved — sending",
  SENT: "Sent",
  REJECTED: "Rejected",
};

/**
 * A user asks for their balance to go out on-chain.
 *
 * The balance is debited immediately, so the same funds cannot be requested
 * twice or spent on a deal while the request is queued. A rejection puts the
 * money back.
 */
export async function requestWithdrawal(input: {
  userId: string;
  amountMicro: bigint;
  toAddress: string;
  network: Network;
  minMicro: bigint;
}) {
  if (input.amountMicro < input.minMicro) {
    throw new WithdrawalError("That is below the minimum withdrawal amount.");
  }
  if (!isValidAddress(input.toAddress, input.network)) {
    throw new WithdrawalError(
      input.network === "TRON"
        ? "That is not a valid TRC-20 address (it should start with T)."
        : "That is not a valid ERC-20 address (it should start with 0x).",
    );
  }

  const pending = await prisma.withdrawal.count({
    where: { userId: input.userId, status: { in: ["REQUESTED", "APPROVED"] } },
  });
  if (pending >= 3) {
    throw new WithdrawalError("You already have withdrawals waiting. Let those settle first.");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const withdrawal = await tx.withdrawal.create({
        data: {
          userId: input.userId,
          amountMicro: input.amountMicro,
          toAddress: input.toAddress,
          network: input.network,
        },
      });

      await postEntry(
        {
          userId: input.userId,
          amountMicro: -input.amountMicro,
          kind: "WITHDRAWAL",
          reference: withdrawal.id,
          note: `Withdrawal to ${input.toAddress}`,
        },
        tx,
      );

      return withdrawal;
    });
  } catch (error) {
    if (error instanceof LedgerError) {
      throw new WithdrawalError("Your balance does not cover that amount.");
    }
    throw error;
  }
}

export async function approveWithdrawal(id: string, adminId: string) {
  const withdrawal = await prisma.withdrawal.findUniqueOrThrow({ where: { id } });
  if (withdrawal.status !== "REQUESTED") {
    throw new WithdrawalError("That withdrawal is not awaiting review.");
  }
  return prisma.withdrawal.update({
    where: { id, status: "REQUESTED" },
    data: { status: "APPROVED", reviewedById: adminId, reviewedAt: new Date() },
  });
}

/** Rejecting returns the money the request had already taken off the balance. */
export async function rejectWithdrawal(id: string, adminId: string, reason: string) {
  const withdrawal = await prisma.withdrawal.findUniqueOrThrow({ where: { id } });
  if (!["REQUESTED", "APPROVED"].includes(withdrawal.status)) {
    throw new WithdrawalError("That withdrawal can no longer be rejected.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.withdrawal.update({
      where: { id, status: withdrawal.status },
      data: { status: "REJECTED", reviewedById: adminId, reviewedAt: new Date(), note: reason },
    });

    await postEntry(
      {
        userId: withdrawal.userId,
        amountMicro: withdrawal.amountMicro,
        kind: "WITHDRAWAL_REVERSAL",
        reference: withdrawal.id,
        note: `Withdrawal rejected: ${reason}`,
        actorId: adminId,
      },
      tx,
    );

    return updated;
  });
}

/**
 * Records that the operator has broadcast the transfer. The balance was already
 * debited when the request was made, so this only closes the request out.
 */
export async function markWithdrawalSent(id: string, adminId: string, txHash: string) {
  const withdrawal = await prisma.withdrawal.findUniqueOrThrow({ where: { id } });
  if (!["REQUESTED", "APPROVED"].includes(withdrawal.status)) {
    throw new WithdrawalError("That withdrawal has already been closed.");
  }
  return prisma.withdrawal.update({
    where: { id, status: withdrawal.status },
    data: {
      status: "SENT",
      txHash,
      sentAt: new Date(),
      reviewedById: withdrawal.reviewedById ?? adminId,
      reviewedAt: withdrawal.reviewedAt ?? new Date(),
    },
  });
}
