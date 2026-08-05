"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { audit, requireUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { parseUsdt } from "@/lib/money";
import { rateLimit } from "@/lib/rate-limit";
import { addressHint, isValidAddress, type Network } from "@/lib/wallet";
import {
  createDeal,
  DealError,
  fundDealFromBalance,
  getSettings,
  buyerMayReveal,
  isParticipant,
  mayCancel,
  mayDispute,
  mayRelease,
  refundBuyer,
  releaseToSeller,
  sellerMayDeliver,
} from "@/lib/deals";
import {
  credentialSchema,
  dealSchema,
  disputeSchema,
  fieldErrors,
  listingSchema,
  messageSchema,
  parseDealItems,
  withdrawalSchema,
  confirmItemSchema,
} from "@/lib/validation";
import { LedgerError } from "@/lib/ledger";
import { requestWithdrawal, WithdrawalError } from "@/lib/withdrawals";
import type { FormState } from "./auth";

async function loadDealForUser(dealId: string) {
  const user = await requireUser();
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { seller: true, buyer: true },
  });
  if (!deal || !isParticipant(deal, user)) {
    throw new DealError("Deal not found.");
  }
  return { user, deal };
}

export async function createListingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = listingSchema.safeParse({
    title: formData.get("title"),
    category: formData.get("category"),
    description: formData.get("description"),
    price: formData.get("price"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const listing = await prisma.listing.create({
    data: {
      sellerId: user.id,
      title: parsed.data.title,
      category: parsed.data.category,
      description: parsed.data.description,
      priceMicro: parseUsdt(parsed.data.price),
    },
  });
  await audit("listing.create", "Listing", listing.id, user.id);
  redirect(`/listings/${listing.id}`);
}

export async function setListingStatusAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("listingId"));
  const status = String(formData.get("status"));
  if (!["ACTIVE", "PAUSED", "REMOVED"].includes(status)) return;

  const updated = await prisma.listing.updateMany({
    where: { id, sellerId: user.id, status: { not: "SOLD" } },
    data: { status },
  });
  if (updated.count) await audit("listing.status", "Listing", id, user.id, { status });
  revalidatePath("/dashboard/listings");
  revalidatePath(`/listings/${id}`);
}

export async function createDealAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!rateLimit(`deal:${user.id}`, 20, 60 * 60 * 1000)) {
    return { errors: { form: "You have opened too many deals in the last hour." } };
  }

  const parsed = dealSchema.safeParse({
    listingId: formData.get("listingId") || undefined,
    network: formData.get("network"),
    sellerEmail: formData.get("sellerEmail"),
    title: formData.get("title"),
    description: formData.get("description"),
    amount: formData.get("amount"),
    inspectionHours: formData.get("inspectionHours"),
    refundAddress: formData.get("refundAddress"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const seller = await prisma.user.findUnique({ where: { email: parsed.data.sellerEmail } });
  if (!seller) {
    return { errors: { sellerEmail: "No EscrowBridge account uses that email. Ask the seller to register first." } };
  }
  if (seller.id === user.id) return { errors: { sellerEmail: "You cannot open a deal with yourself." } };
  if (seller.isBlocked) return { errors: { sellerEmail: "That seller cannot accept deals right now." } };

  const network = parsed.data.network as Network;
  if (!isValidAddress(parsed.data.refundAddress, network)) {
    return { errors: { refundAddress: addressHint(network) } };
  }

  let items: { label: string; amountMicro: bigint }[] | null;
  try {
    const raw = parseDealItems(
      formData.getAll("itemLabel").map(String),
      formData.getAll("itemAmount").map(String),
    );
    items = raw?.map((item) => ({ label: item.label, amountMicro: parseUsdt(item.amount) })) ?? null;
  } catch (error) {
    return { errors: { items: (error as Error).message } };
  }

  let dealId: string;
  try {
    const deal = await createDeal({
      buyerId: user.id,
      sellerId: seller.id,
      listingId: parsed.data.listingId ?? null,
      title: parsed.data.title,
      description: parsed.data.description,
      priceMicro: parseUsdt(parsed.data.amount),
      inspectionHours: parsed.data.inspectionHours,
      refundAddress: parsed.data.refundAddress,
      network,
      items,
    });
    dealId = deal.id;
    await audit("deal.create", "Deal", deal.id, user.id, { amountMicro: deal.amountMicro.toString() });
  } catch (error) {
    if (error instanceof DealError) return { errors: { form: error.message } };
    // Unexpected failures are logged for the operator but never echoed to the
    // user, so an internal message can't leak through the form.
    console.error("createDeal failed", error);
    return { errors: { form: "Could not open the deal. Please try again." } };
  }

  redirect(`/deals/${dealId}`);
}

/**
 * The buyer's verdict on a single vault item. Ticking items off one at a time
 * is what makes a part-delivered deal legible: everyone can see that four of
 * five assets arrived and exactly which one did not.
 */
export async function confirmItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = confirmItemSchema.safeParse({
    credentialId: formData.get("credentialId"),
    verdict: formData.get("verdict"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const user = await requireUser();
  const credential = await prisma.credential.findUnique({
    where: { id: parsed.data.credentialId },
    include: { deal: true },
  });
  if (!credential) return { errors: { form: "Not found." } };
  if (credential.deal.buyerId !== user.id) {
    return { errors: { form: "Only the buyer can check items off." } };
  }
  if (!["DELIVERED", "DISPUTED"].includes(credential.deal.status)) {
    return { errors: { form: "This deal is not open for inspection." } };
  }
  if (parsed.data.verdict === "REJECT" && !parsed.data.note) {
    return { errors: { note: "Say what is wrong with this item." } };
  }

  const now = new Date();
  await prisma.credential.update({
    where: { id: credential.id },
    data: {
      confirmedAt: parsed.data.verdict === "CONFIRM" ? now : null,
      rejectedAt: parsed.data.verdict === "REJECT" ? now : null,
      rejectedNote: parsed.data.verdict === "REJECT" ? (parsed.data.note ?? null) : null,
    },
  });
  await audit(`credential.${parsed.data.verdict.toLowerCase()}`, "Credential", credential.id, user.id, {
    dealId: credential.dealId,
  });

  revalidatePath(`/deals/${credential.dealId}`);
  return { ok: true };
}

/** Buyer pays for the deal out of their platform balance instead of on-chain. */
export async function fundFromBalanceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const dealId = String(formData.get("dealId"));
  const { user, deal } = await loadDealForUser(dealId);
  if (deal.buyerId !== user.id) return { errors: { form: "Only the buyer can fund this deal." } };

  try {
    await fundDealFromBalance(dealId, user.id);
  } catch (error) {
    if (error instanceof DealError) return { errors: { form: error.message } };
    if (error instanceof LedgerError) {
      return { errors: { form: "Your balance does not cover this deal." } };
    }
    throw error;
  }

  await audit("deal.fund_from_balance", "Deal", dealId, user.id);
  revalidatePath(`/deals/${dealId}`);
  return { ok: true, message: "Deal funded from your balance." };
}

/** User asks for their balance to be sent out on-chain. */
export async function requestWithdrawalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = withdrawalSchema.safeParse({
    amount: formData.get("amount"),
    toAddress: formData.get("toAddress"),
    network: formData.get("network"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  if (!rateLimit(`withdraw:${user.id}`, 10, 60 * 60 * 1000)) {
    return { errors: { form: "Too many withdrawal requests in the last hour." } };
  }

  const settings = await getSettings();
  try {
    const withdrawal = await requestWithdrawal({
      userId: user.id,
      amountMicro: parseUsdt(parsed.data.amount),
      toAddress: parsed.data.toAddress,
      network: parsed.data.network as Network,
      minMicro: settings.minWithdrawalMicro,
    });
    await audit("withdrawal.request", "Withdrawal", withdrawal.id, user.id, {
      amountMicro: withdrawal.amountMicro.toString(),
    });
  } catch (error) {
    if (error instanceof WithdrawalError) return { errors: { form: error.message } };
    throw error;
  }

  revalidatePath("/dashboard/wallet");
  return { ok: true, message: "Withdrawal requested. An operator will review it shortly." };
}

export async function cancelDealAction(formData: FormData): Promise<void> {
  const dealId = String(formData.get("dealId"));
  const { user, deal } = await loadDealForUser(dealId);
  if (deal.buyerId !== user.id && user.role !== "ADMIN") return;
  if (!mayCancel(deal)) return;

  await prisma.deal.update({
    where: { id: dealId, status: "AWAITING_PAYMENT" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  await audit("deal.cancel", "Deal", dealId, user.id);
  revalidatePath(`/deals/${dealId}`);
}

/**
 * Seller hands over the goods. Credentials are encrypted before they touch the
 * database and the inspection clock starts here.
 */
export async function deliverCredentialsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const dealId = String(formData.get("dealId"));
  const { user, deal } = await loadDealForUser(dealId);
  if (deal.sellerId !== user.id) return { errors: { form: "Only the seller can deliver on this deal." } };
  if (!sellerMayDeliver(deal)) {
    return { errors: { form: "You can only deliver once the buyer's funds are in escrow." } };
  }

  const labels = formData.getAll("label").map(String);
  const kinds = formData.getAll("kind").map(String);
  const values = formData.getAll("value").map(String);

  const items: { label: string; kind: string; value: string }[] = [];
  for (let i = 0; i < labels.length; i += 1) {
    if (!values[i]?.trim()) continue; // skip blank rows the seller left untouched
    const parsed = credentialSchema.safeParse({ label: labels[i], kind: kinds[i], value: values[i] });
    if (!parsed.success) return { errors: { form: `Row ${i + 1}: ${Object.values(fieldErrors(parsed.error))[0]}` } };
    items.push(parsed.data);
  }
  if (items.length === 0) return { errors: { form: "Add at least one credential before delivering." } };

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.credential.createMany({
      data: items.map((item) => ({
        dealId,
        label: item.label,
        kind: item.kind,
        ciphertext: encryptSecret(dealId, item.value),
      })),
    });
    await tx.deal.update({
      where: { id: dealId, status: "FUNDED" },
      data: {
        status: "DELIVERED",
        deliveredAt: now,
        inspectionEndsAt: new Date(now.getTime() + deal.inspectionHours * 60 * 60 * 1000),
      },
    });
  });

  await audit("deal.deliver", "Deal", dealId, user.id, { itemCount: items.length });
  revalidatePath(`/deals/${dealId}`);
  return { ok: true, message: "Credentials delivered. The buyer's inspection window has started." };
}

/** Buyer decrypts one credential. Every read is counted and logged. */
export async function revealCredentialAction(credentialId: string): Promise<{ value?: string; error?: string }> {
  const user = await requireUser();
  const credential = await prisma.credential.findUnique({
    where: { id: credentialId },
    include: { deal: true },
  });
  if (!credential) return { error: "Not found." };
  if (!buyerMayReveal(credential.deal, user.id)) {
    return { error: "You can only view these once the deal has been delivered to you." };
  }
  if (credential.purgedAt) return { error: "This credential was purged after the retention window." };
  if (!rateLimit(`reveal:${user.id}`, 120, 60 * 60 * 1000)) {
    return { error: "Too many reveals in a short time. Please slow down." };
  }

  const { decryptSecret } = await import("@/lib/crypto");
  let value: string;
  try {
    value = decryptSecret(credential.dealId, credential.ciphertext);
  } catch {
    return { error: "This credential could not be decrypted. Support has been notified." };
  }

  await prisma.credential.update({
    where: { id: credentialId },
    data: {
      revealCount: { increment: 1 },
      firstRevealedAt: credential.firstRevealedAt ?? new Date(),
    },
  });
  await audit("credential.reveal", "Credential", credentialId, user.id, { dealId: credential.dealId });

  return { value };
}

/** Buyer confirms the goods work; escrow is released and a payout is queued. */
export async function releaseAction(formData: FormData): Promise<void> {
  const dealId = String(formData.get("dealId"));
  const { user, deal } = await loadDealForUser(dealId);
  if (deal.buyerId !== user.id) return;
  if (!mayRelease(deal)) return;

  await releaseToSeller(dealId, `Released by buyer ${user.email}`, user.id);
  await audit("deal.release", "Deal", dealId, user.id);
  revalidatePath(`/deals/${dealId}`);
}

export async function openDisputeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const dealId = String(formData.get("dealId"));
  const { user, deal } = await loadDealForUser(dealId);
  if (!mayDispute(deal)) return { errors: { form: "This deal cannot be disputed right now." } };
  if (deal.buyerId !== user.id && deal.sellerId !== user.id) {
    return { errors: { form: "Only the buyer or seller can open a dispute." } };
  }

  const parsed = disputeSchema.safeParse({ reason: formData.get("reason") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  await prisma.$transaction(async (tx) => {
    await tx.dispute.create({
      data: { dealId, openedById: user.id, reason: parsed.data.reason },
    });
    await tx.deal.update({ where: { id: dealId }, data: { status: "DISPUTED" } });
  });

  await audit("dispute.open", "Deal", dealId, user.id);
  revalidatePath(`/deals/${dealId}`);
  return { ok: true, message: "Dispute opened. A moderator will review the deal." };
}

export async function sendMessageAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const dealId = String(formData.get("dealId"));
  const { user } = await loadDealForUser(dealId);

  const parsed = messageSchema.safeParse({ body: formData.get("body") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  if (!rateLimit(`msg:${user.id}`, 60, 5 * 60 * 1000)) {
    return { errors: { form: "You are sending messages too quickly." } };
  }

  await prisma.message.create({
    data: { dealId, senderId: user.id, body: parsed.data.body, isStaff: user.role === "ADMIN" },
  });
  revalidatePath(`/deals/${dealId}`);
  return { ok: true };
}

/** Escape hatch used by the admin console when running the mock wallet locally. */
export async function simulatePaymentAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return;
  const { recordPayment } = await import("@/lib/payments");
  const dealId = String(formData.get("dealId"));
  await recordPayment({
    dealId,
    txHash: `simulated-${dealId}-${Date.now()}`,
    amountMicro: null,
    confirmations: 999,
    fromAddress: null,
  });
  await audit("payment.simulate", "Deal", dealId, user.id);
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/admin");
}

export async function refundBuyerAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return;
  const dealId = String(formData.get("dealId"));
  await refundBuyer(dealId, `Refunded by admin ${user.email}`, user.id);
  await audit("deal.refund", "Deal", dealId, user.id);
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/admin");
}
