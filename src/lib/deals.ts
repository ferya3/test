import "server-only";
import { prisma } from "./db";
import { referenceCode } from "./crypto";
import { feeFor, formatUsdt } from "./money";
import { getWallet, type Network } from "./wallet";
import { postEntry } from "./ledger";
import { getTreasuryAddress } from "./treasury";

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
async function reserveDepositAddress(
  network: Network,
): Promise<{ index: number; address: string } | null> {
  const wallet = getWallet();
  if (!wallet) return null; // deposits go to the shared treasury address instead

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const settings = await getSettings();
    const index = settings.nextDerivationIndex;
    const updated = await prisma.settings.updateMany({
      where: { id: "singleton", nextDerivationIndex: index },
      data: { nextDerivationIndex: index + 1 },
    });
    if (updated.count === 1) {
      return { index, address: wallet.deriveDepositAddress(index, network) };
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
  /** What the seller is asking for the goods, before the platform fee. */
  priceMicro: bigint;
  inspectionHours: number;
  refundAddress: string;
  network?: Network;
  /**
   * Optional itemisation. Amounts are optional too: price every item and they
   * must sum to priceMicro, or price none and the lot carries one price.
   */
  items?: { label: string; amountMicro?: bigint | null }[] | null;
};

/**
 * The platform fee is charged *on top* of the sale price: the buyer funds
 * price + fee, and the seller receives the full price they asked for.
 */
export async function createDeal(input: CreateDealInput) {
  const settings = await getSettings();

  if (input.priceMicro < settings.minDealMicro || input.priceMicro > settings.maxDealMicro) {
    throw new DealError("That amount is outside the limits allowed for escrow deals.");
  }
  if (input.buyerId === input.sellerId) {
    throw new DealError("You cannot open a deal with yourself.");
  }

  if (input.items?.length) {
    const priced = input.items.filter((item) => item.amountMicro != null);

    // Half-priced lines would render an invoice that neither adds up nor reads
    // as a single lot, so it is all of them or none.
    if (priced.length > 0 && priced.length !== input.items.length) {
      throw new DealError("Either give every line item an amount, or leave them all blank.");
    }

    if (priced.length > 0) {
      // An invoice whose lines do not add up to what was escrowed is worse than
      // one with no lines at all, so the two are reconciled before the deal
      // exists.
      const summed = priced.reduce((total, item) => total + item.amountMicro!, 0n);
      if (summed !== input.priceMicro) {
        throw new DealError(
          `The line items add up to ${formatUsdt(summed)} USDT but the sale price is ${formatUsdt(input.priceMicro)} USDT.`,
        );
      }
      if (priced.some((item) => item.amountMicro! <= 0n)) {
        throw new DealError("Every line item needs an amount above zero.");
      }
    }
  }

  const network = input.network ?? "TRON";
  const fee = feeFor(input.priceMicro, settings.feeBasisPoints);
  const derived = await reserveDepositAddress(network);

  // A deal the buyer cannot pay into is worse than no deal at all, so refuse
  // rather than create one with nowhere to send the money.
  if (!derived && !(await getTreasuryAddress(network))) {
    throw new DealError(
      "No deposit address is configured for that network yet. Ask an administrator to set one.",
    );
  }

  return prisma.deal.create({
    data: {
      reference: referenceCode(),
      buyerId: input.buyerId,
      sellerId: input.sellerId,
      listingId: input.listingId ?? null,
      title: input.title,
      description: input.description,
      amountMicro: input.priceMicro + fee,
      feeMicro: fee,
      payoutMicro: input.priceMicro,
      network,
      depositAddress: derived?.address ?? null,
      depositDerivation: derived?.index ?? null,
      inspectionHours: input.inspectionHours,
      buyerRefundAddress: input.refundAddress,
      expiresAt: new Date(Date.now() + settings.paymentWindowMins * 60 * 1000),
      items: input.items?.length
        ? {
            create: input.items.map((item, position) => ({
              position,
              label: item.label,
              amountMicro: item.amountMicro ?? null,
            })),
          }
        : undefined,
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
 * Funds a deal straight from the buyer's platform balance, skipping the wait
 * for an on-chain deposit. Used when the buyer already has credit — from an
 * earlier refund, a completed sale, or a manual credit by an operator.
 */
export async function fundDealFromBalance(dealId: string, buyerId: string) {
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (deal.buyerId !== buyerId) throw new DealError("Only the buyer can fund this deal.");
  if (deal.status !== "AWAITING_PAYMENT") throw new DealError("This deal is not awaiting payment.");
  if (deal.expiresAt < new Date()) throw new DealError("The payment window for this deal has closed.");

  return prisma.$transaction(async (tx) => {
    // postEntry refuses to go below zero, so an insufficient balance aborts the
    // whole transaction and the deal stays unfunded.
    await postEntry(
      {
        userId: buyerId,
        amountMicro: -deal.amountMicro,
        kind: "DEAL_FUNDING",
        dealId,
        reference: deal.reference,
        note: `Funded deal ${deal.reference} from balance`,
      },
      tx,
    );

    return tx.deal.update({
      where: { id: dealId, status: "AWAITING_PAYMENT" },
      data: { status: "FUNDED", fundedAt: new Date(), fundingSource: "FUNDED_FROM_BALANCE" },
    });
  });
}

/**
 * Releases escrow to the seller. The money lands on the seller's platform
 * balance rather than going straight on-chain — they withdraw it when they
 * choose, which keeps the number of outbound transfers (and their fees) down.
 *
 * Called by the buyer, by auto-release when the inspection window lapses, or by
 * an admin resolving a dispute in the seller's favour.
 */
export async function releaseToSeller(dealId: string, note: string, actorId?: string) {
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!["DELIVERED", "DISPUTED"].includes(deal.status)) {
    throw new DealError("This deal cannot be released in its current state.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.deal.update({
      where: { id: dealId, status: deal.status },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    await postEntry(
      {
        userId: deal.sellerId,
        amountMicro: deal.payoutMicro,
        kind: "DEAL_PAYOUT",
        dealId,
        reference: deal.reference,
        note,
        actorId: actorId ?? null,
      },
      tx,
    );

    if (deal.listingId) {
      await tx.listing.updateMany({ where: { id: deal.listingId }, data: { status: "SOLD" } });
    }
    return updated;
  });
}

/** Returns escrowed funds to the buyer's balance, ready to re-spend or withdraw. */
export async function refundBuyer(dealId: string, note: string, actorId?: string) {
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!["FUNDED", "DELIVERED", "DISPUTED"].includes(deal.status)) {
    throw new DealError("This deal cannot be refunded in its current state.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.deal.update({
      where: { id: dealId, status: deal.status },
      data: { status: "REFUNDED", refundedAt: new Date() },
    });

    await postEntry(
      {
        userId: deal.buyerId,
        amountMicro: deal.amountMicro,
        kind: "DEAL_REFUND",
        dealId,
        reference: deal.reference,
        note,
        actorId: actorId ?? null,
      },
      tx,
    );

    return updated;
  });
}

/**
 * Housekeeping run by the watcher: expire unpaid deals and auto-release ones
 * whose inspection window closed without the buyer acting. Without auto-release
 * a silent buyer could strand a seller's money indefinitely.
 */
export async function runScheduledTransitions(): Promise<{
  expired: number;
  released: number;
  held: number;
}> {
  const now = new Date();

  const expired = await prisma.deal.updateMany({
    where: { status: "AWAITING_PAYMENT", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });

  const dueForRelease = await prisma.deal.findMany({
    where: {
      status: "DELIVERED",
      inspectionEndsAt: { lt: now },
      // Auto-release exists for a buyer who went silent. A buyer who marked an
      // item as not working is the opposite of silent, and paying the seller in
      // full because a timer ran out would be taking the money off the one
      // person who did raise the problem. Those deals wait for a human.
      credentials: { none: { rejectedAt: { not: null } } },
    },
    select: { id: true },
  });

  let released = 0;
  for (const deal of dueForRelease) {
    try {
      await releaseToSeller(deal.id, "Auto-released: inspection period elapsed without a dispute");
      released += 1;
    } catch (error) {
      console.error(`[deals] auto-release failed for ${deal.id}:`, (error as Error).message);
    }
  }

  const held = await prisma.deal.count({
    where: {
      status: "DELIVERED",
      inspectionEndsAt: { lt: now },
      credentials: { some: { rejectedAt: { not: null } } },
    },
  });
  if (held > 0) {
    console.warn(`[deals] ${held} deal(s) past inspection with a rejected item — awaiting an operator.`);
  }

  return { expired: expired.count, released, held };
}
