import "server-only";
import { prisma } from "./db";
import { referenceCode } from "./crypto";
import { feeFor } from "./money";
import { getWallet, type Network } from "./wallet";

export {
  STATUS_LABELS,
  STATUS_TONES,
  OPEN_STATUSES,
  type DealStatus,
} from "./deal-status";

export async function getSettings() {
  return prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });
}

/**
 * Reserves the next HD index and derives a deposit address for it. The index is
 * bumped inside a transaction so two concurrent deals can never share an
 * address — which would make it impossible to tell whose money arrived.
 */
async function reserveDepositAddress(): Promise<{ index: number; address: string }> {
  const wallet = getWallet();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const settings = await getSettings();
    const index = settings.nextDerivationIndex;
    const updated = await prisma.settings.updateMany({
      where: { id: "singleton", nextDerivationIndex: index },
      data: { nextDerivationIndex: index + 1 },
    });
    if (updated.count === 1) {
      return { index, address: wallet.deriveDepositAddress(index) };
    }
  }
  throw new Error("Could not reserve a deposit address, please retry");
}

export type CreateDealInput = {
  buyerId: string;
  sellerId: string;
  listingId?: string | null;
  title: string;
  description: string;
  amountMicro: bigint;
  inspectionHours: number;
  refundAddress: string;
  network?: Network;
};

export async function createDeal(input: CreateDealInput) {
  const settings = await getSettings();

  if (input.amountMicro < settings.minDealMicro || input.amountMicro > settings.maxDealMicro) {
    throw new DealError("That amount is outside the limits allowed for escrow deals.");
  }
  if (input.buyerId === input.sellerId) {
    throw new DealError("You cannot open a deal with yourself.");
  }

  const fee = feeFor(input.amountMicro, settings.feeBasisPoints);
  const { index, address } = await reserveDepositAddress();

  return prisma.deal.create({
    data: {
      reference: referenceCode(),
      buyerId: input.buyerId,
      sellerId: input.sellerId,
      listingId: input.listingId ?? null,
      title: input.title,
      description: input.description,
      amountMicro: input.amountMicro,
      feeMicro: fee,
      payoutMicro: input.amountMicro - fee,
      network: input.network ?? "TRON",
      depositAddress: address,
      depositDerivation: index,
      inspectionHours: input.inspectionHours,
      buyerRefundAddress: input.refundAddress,
      expiresAt: new Date(Date.now() + settings.paymentWindowMins * 60 * 1000),
    },
  });
}

export class DealError extends Error {}

/**
 * Marks a deal funded. Idempotent: replaying the same confirmation (a watcher
 * restart, a duplicated webhook) leaves the deal untouched.
 */
export async function markFunded(dealId: string) {
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (deal.status !== "AWAITING_PAYMENT") return deal;

  return prisma.deal.update({
    where: { id: dealId, status: "AWAITING_PAYMENT" },
    data: { status: "FUNDED", fundedAt: new Date() },
  });
}

/** Total confirmed on-chain value received against a deal. */
export async function confirmedTotal(dealId: string): Promise<bigint> {
  const payments = await prisma.payment.findMany({
    where: { dealId, status: { in: ["CONFIRMED", "OVERPAID"] } },
    select: { amountMicro: true },
  });
  return payments.reduce((sum, p) => sum + p.amountMicro, 0n);
}

export function isParticipant(
  deal: { buyerId: string; sellerId: string },
  user: { id: string; role: string },
): boolean {
  return user.role === "ADMIN" || deal.buyerId === user.id || deal.sellerId === user.id;
}

/**
 * The buyer may only read the seller's secrets once the money is actually in
 * escrow — this is the single rule the whole product rests on.
 */
export function buyerMayReveal(deal: { status: string; buyerId: string }, userId: string): boolean {
  if (deal.buyerId !== userId) return false;
  return ["DELIVERED", "COMPLETED", "DISPUTED"].includes(deal.status);
}

export function sellerMayDeliver(deal: { status: string }): boolean {
  return deal.status === "FUNDED";
}

export function mayRelease(deal: { status: string }): boolean {
  return deal.status === "DELIVERED";
}

export function mayDispute(deal: { status: string }): boolean {
  return ["FUNDED", "DELIVERED"].includes(deal.status);
}

export function mayCancel(deal: { status: string }): boolean {
  return deal.status === "AWAITING_PAYMENT";
}

/**
 * Releases escrow to the seller and queues the payout. Called by the buyer, by
 * auto-release when the inspection window lapses, or by an admin resolving a
 * dispute in the seller's favour.
 */
export async function releaseToSeller(dealId: string, note: string) {
  const deal = await prisma.deal.findUniqueOrThrow({
    where: { id: dealId },
    include: { seller: true, payout: true },
  });
  if (!["DELIVERED", "DISPUTED"].includes(deal.status)) {
    throw new DealError("This deal cannot be released in its current state.");
  }
  const destination = deal.seller.payoutAddress;
  if (!destination) {
    throw new DealError("The seller has not set a payout address yet.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.deal.update({
      where: { id: dealId, status: deal.status },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    if (!deal.payout) {
      await tx.payout.create({
        data: {
          dealId,
          toAddress: destination,
          network: deal.seller.payoutNetwork,
          amountMicro: deal.payoutMicro,
          note,
        },
      });
    }
    if (deal.listingId) {
      await tx.listing.updateMany({ where: { id: deal.listingId }, data: { status: "SOLD" } });
    }
    return updated;
  });
}

/** Returns escrowed funds to the buyer and queues the refund. */
export async function refundBuyer(dealId: string, note: string) {
  const deal = await prisma.deal.findUniqueOrThrow({
    where: { id: dealId },
    include: { refund: true },
  });
  if (!["FUNDED", "DELIVERED", "DISPUTED"].includes(deal.status)) {
    throw new DealError("This deal cannot be refunded in its current state.");
  }
  if (!deal.buyerRefundAddress) {
    throw new DealError("No refund address is on file for this deal.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.deal.update({
      where: { id: dealId, status: deal.status },
      data: { status: "REFUNDED", refundedAt: new Date() },
    });
    if (!deal.refund) {
      await tx.refund.create({
        data: {
          dealId,
          toAddress: deal.buyerRefundAddress!,
          network: deal.network,
          amountMicro: deal.amountMicro,
          note,
        },
      });
    }
    return updated;
  });
}

/**
 * Housekeeping run by the watcher: expire unpaid deals and auto-release ones
 * whose inspection window closed without the buyer acting. Without auto-release
 * a silent buyer could strand a seller's money indefinitely.
 */
export async function runScheduledTransitions(): Promise<{ expired: number; released: number }> {
  const now = new Date();

  const expired = await prisma.deal.updateMany({
    where: { status: "AWAITING_PAYMENT", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });

  const dueForRelease = await prisma.deal.findMany({
    where: { status: "DELIVERED", inspectionEndsAt: { lt: now } },
    select: { id: true },
  });

  let released = 0;
  for (const deal of dueForRelease) {
    try {
      await releaseToSeller(deal.id, "Auto-released: inspection period elapsed without a dispute");
      released += 1;
    } catch {
      // A seller with no payout address blocks release; the admin queue surfaces it.
    }
  }

  return { expired: expired.count, released };
}
