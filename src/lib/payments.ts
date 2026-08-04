import "server-only";
import { prisma } from "./db";
import { confirmedTotal, getSettings, markFunded } from "./deals";

export type IncomingTransfer = {
  dealId: string;
  txHash: string;
  /** `null` means "credit exactly what the deal asks for" (admin simulation). */
  amountMicro: bigint | null;
  confirmations: number;
  fromAddress: string | null;
};

/**
 * Records an on-chain transfer against a deal and funds the deal once enough
 * confirmed value has arrived.
 *
 * Idempotent on `txHash`: the watcher re-reads the same block range on every
 * pass, so this is called repeatedly with the same transfer and must only ever
 * update the confirmation count.
 */
export async function recordPayment(transfer: IncomingTransfer) {
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: transfer.dealId } });
  const settings = await getSettings();
  const amount = transfer.amountMicro ?? deal.amountMicro;
  const confirmed = transfer.confirmations >= settings.requiredConfirmations;

  const existing = await prisma.payment.findUnique({ where: { txHash: transfer.txHash } });

  if (existing) {
    await prisma.payment.update({
      where: { txHash: transfer.txHash },
      data: {
        confirmations: transfer.confirmations,
        status: confirmed ? statusFor(deal.amountMicro, existing.amountMicro) : "PENDING",
        confirmedAt: confirmed ? existing.confirmedAt ?? new Date() : null,
      },
    });
  } else {
    await prisma.payment.create({
      data: {
        dealId: deal.id,
        txHash: transfer.txHash,
        fromAddress: transfer.fromAddress,
        amountMicro: amount,
        network: deal.network,
        confirmations: transfer.confirmations,
        status: confirmed ? statusFor(deal.amountMicro, amount) : "PENDING",
        confirmedAt: confirmed ? new Date() : null,
      },
    });
  }

  // Partial payments accumulate: a buyer who sends the amount in two transfers
  // still ends up funded once the total covers the deal.
  const total = await confirmedTotal(deal.id);
  if (total >= deal.amountMicro && deal.status === "AWAITING_PAYMENT") {
    await markFunded(deal.id);
    return { funded: true, total };
  }
  return { funded: false, total };
}

function statusFor(expected: bigint, received: bigint): string {
  if (received < expected) return "UNDERPAID";
  if (received > expected) return "OVERPAID";
  return "CONFIRMED";
}

/** Deals the chain watcher still needs to poll for deposits. */
export async function watchableDeals() {
  return prisma.deal.findMany({
    where: { status: "AWAITING_PAYMENT", expiresAt: { gt: new Date() } },
    select: { id: true, depositAddress: true, amountMicro: true, network: true, createdAt: true },
  });
}
