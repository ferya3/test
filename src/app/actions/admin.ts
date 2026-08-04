"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit, requireAdmin } from "@/lib/auth";
import { parseUsdt } from "@/lib/money";
import { purgedEnvelope } from "@/lib/crypto";
import { refundBuyer, releaseToSeller } from "@/lib/deals";
import { LedgerError, postEntry } from "@/lib/ledger";
import { setTreasuryWallet, TreasuryError } from "@/lib/treasury";
import { networkShort, type Network } from "@/lib/wallet";
import {
  approveWithdrawal,
  markWithdrawalSent,
  rejectWithdrawal,
  WithdrawalError,
} from "@/lib/withdrawals";
import {
  adjustBalanceSchema,
  fieldErrors,
  treasuryWalletSchema,
  rejectWithdrawalSchema,
  resolveDisputeSchema,
  settingsSchema,
  txHashSchema,
} from "@/lib/validation";
import type { FormState } from "./auth";

export async function resolveDisputeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const dealId = String(formData.get("dealId"));

  const parsed = resolveDisputeSchema.safeParse({
    outcome: formData.get("outcome"),
    resolution: formData.get("resolution"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const dispute = await prisma.dispute.findUnique({ where: { dealId } });
  if (!dispute || dispute.status !== "OPEN") return { errors: { form: "That dispute is not open." } };

  try {
    if (parsed.data.outcome === "RELEASE_TO_SELLER") {
      await releaseToSeller(dealId, `Dispute resolved for the seller by ${admin.email}`, admin.id);
    } else {
      await refundBuyer(dealId, `Dispute resolved for the buyer by ${admin.email}`, admin.id);
    }
  } catch (error) {
    return { errors: { form: (error as Error).message } };
  }

  await prisma.dispute.update({
    where: { dealId },
    data: {
      status: parsed.data.outcome === "RELEASE_TO_SELLER" ? "RESOLVED_SELLER" : "RESOLVED_BUYER",
      resolution: parsed.data.resolution,
      resolvedAt: new Date(),
    },
  });
  await audit("dispute.resolve", "Deal", dealId, admin.id, { outcome: parsed.data.outcome });

  revalidatePath("/admin");
  revalidatePath(`/deals/${dealId}`);
  return { ok: true, message: "Dispute resolved." };
}

/**
 * Manually moves a user's balance. This is the operator's tool for the cases
 * the automatic flow cannot see — most often a buyer who sent USDT straight to
 * the treasury wallet instead of a deal's deposit address.
 *
 * A reason is mandatory: an unexplained balance change is indistinguishable
 * from theft when someone audits the books later.
 */
export async function adjustBalanceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = adjustBalanceSchema.safeParse({
    userId: formData.get("userId"),
    direction: formData.get("direction"),
    amount: formData.get("amount"),
    reason: formData.get("reason"),
    reference: formData.get("reference") || undefined,
    network: formData.get("network") || undefined,
    fromAddress: formData.get("fromAddress") || undefined,
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const target = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!target) return { errors: { form: "No such user." } };

  const magnitude = parseUsdt(parsed.data.amount);
  const signed = parsed.data.direction === "CREDIT" ? magnitude : -magnitude;

  // Where the money came from belongs on the entry itself, so the ledger alone
  // is enough to trace a deposit back to the chain without a separate note.
  const provenance = [
    parsed.data.network ? `via ${networkShort(parsed.data.network)}` : null,
    parsed.data.fromAddress ? `from ${parsed.data.fromAddress}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const note = provenance ? `${parsed.data.reason} — ${provenance}` : parsed.data.reason;

  try {
    await postEntry({
      userId: target.id,
      amountMicro: signed,
      kind: parsed.data.direction === "CREDIT" ? "MANUAL_CREDIT" : "MANUAL_DEBIT",
      note,
      reference: parsed.data.reference ?? null,
      actorId: admin.id,
    });
  } catch (error) {
    if (error instanceof LedgerError) return { errors: { form: error.message } };
    throw error;
  }

  await audit("balance.adjust", "User", target.id, admin.id, {
    amountMicro: signed.toString(),
    reason: parsed.data.reason,
    reference: parsed.data.reference ?? null,
    network: parsed.data.network ?? null,
    fromAddress: parsed.data.fromAddress ?? null,
  });

  revalidatePath(`/admin/users/${target.id}`);
  revalidatePath("/admin/treasury");
  return {
    ok: true,
    message: `${parsed.data.direction === "CREDIT" ? "Credited" : "Debited"} ${parsed.data.amount} USDT.`,
  };
}

/** Edits the platform's own receiving address for one network. */
export async function setTreasuryWalletAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = treasuryWalletSchema.safeParse({
    network: formData.get("network"),
    address: formData.get("address"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  try {
    await setTreasuryWallet(parsed.data.network as Network, parsed.data.address, parsed.data.note ?? null);
  } catch (error) {
    if (error instanceof TreasuryError) return { errors: { address: error.message } };
    throw error;
  }
  await audit("treasury.wallet_set", "TreasuryWallet", parsed.data.network, admin.id, {
    address: parsed.data.address || null,
  });

  revalidatePath("/admin/settings");
  return {
    ok: true,
    message: parsed.data.address.trim()
      ? `${networkShort(parsed.data.network)} address saved.`
      : `${networkShort(parsed.data.network)} address cleared.`,
  };
}

export async function setUserRoleAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId"));
  const role = String(formData.get("role"));
  if (!["USER", "ADMIN"].includes(role)) return;
  // Demoting yourself could leave the platform with no administrator at all.
  if (userId === admin.id) return;

  await prisma.user.update({ where: { id: userId }, data: { role } });
  await audit("user.role", "User", userId, admin.id, { role });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

export async function setUserBlockedAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId"));
  const blocked = formData.get("blocked") === "true";
  if (userId === admin.id) return; // never lock yourself out

  await prisma.user.update({ where: { id: userId }, data: { isBlocked: blocked } });
  if (blocked) {
    await prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  await audit(blocked ? "user.block" : "user.unblock", "User", userId, admin.id);

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

/** Signs a user out everywhere — the first move when an account may be compromised. */
export async function revokeSessionsAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId"));

  const result = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await audit("user.revoke_sessions", "User", userId, admin.id, { count: result.count });

  revalidatePath(`/admin/users/${userId}`);
}

export async function approveWithdrawalAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("withdrawalId"));
  try {
    await approveWithdrawal(id, admin.id);
    await audit("withdrawal.approve", "Withdrawal", id, admin.id);
  } catch (error) {
    if (!(error instanceof WithdrawalError)) throw error;
  }
  revalidatePath("/admin/treasury");
}

export async function rejectWithdrawalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const id = String(formData.get("withdrawalId"));
  const parsed = rejectWithdrawalSchema.safeParse({ reason: formData.get("reason") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  try {
    await rejectWithdrawal(id, admin.id, parsed.data.reason);
    await audit("withdrawal.reject", "Withdrawal", id, admin.id, { reason: parsed.data.reason });
  } catch (error) {
    if (error instanceof WithdrawalError) return { errors: { form: error.message } };
    throw error;
  }

  revalidatePath("/admin/treasury");
  return { ok: true, message: "Withdrawal rejected and the balance returned." };
}

/** Treasury operator records the hash of a transfer they broadcast by hand. */
export async function markWithdrawalSentAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("withdrawalId"));
  const parsed = txHashSchema.safeParse({ txHash: formData.get("txHash") });
  if (!parsed.success) return;

  try {
    await markWithdrawalSent(id, admin.id, parsed.data.txHash);
    await audit("withdrawal.sent", "Withdrawal", id, admin.id, { txHash: parsed.data.txHash });
  } catch (error) {
    if (!(error instanceof WithdrawalError)) throw error;
  }
  revalidatePath("/admin/treasury");
}

export async function updateSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = settingsSchema.safeParse({
    feeBasisPoints: formData.get("feeBasisPoints"),
    minDeal: formData.get("minDeal"),
    maxDeal: formData.get("maxDeal"),
    minWithdrawal: formData.get("minWithdrawal"),
    paymentWindowMins: formData.get("paymentWindowMins"),
    requiredConfirmations: formData.get("requiredConfirmations"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const minDealMicro = parseUsdt(parsed.data.minDeal);
  const maxDealMicro = parseUsdt(parsed.data.maxDeal);
  if (minDealMicro >= maxDealMicro) {
    return { errors: { minDeal: "The minimum must be below the maximum." } };
  }

  await prisma.settings.update({
    where: { id: "singleton" },
    data: {
      feeBasisPoints: parsed.data.feeBasisPoints,
      minDealMicro,
      maxDealMicro,
      minWithdrawalMicro: parseUsdt(parsed.data.minWithdrawal),
      paymentWindowMins: parsed.data.paymentWindowMins,
      requiredConfirmations: parsed.data.requiredConfirmations,
    },
  });
  await audit("settings.update", "Settings", "singleton", admin.id);

  revalidatePath("/admin/settings");
  return { ok: true, message: "Settings saved." };
}

/**
 * Destroys the stored secrets for a settled deal. Credentials only need to
 * exist during the trade; keeping them afterwards is pure liability.
 */
export async function purgeCredentialsAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const dealId = String(formData.get("dealId"));

  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!["COMPLETED", "REFUNDED", "CANCELLED", "EXPIRED"].includes(deal.status)) return;

  const result = await prisma.credential.updateMany({
    where: { dealId, purgedAt: null },
    data: { ciphertext: purgedEnvelope(), purgedAt: new Date() },
  });
  await audit("credential.purge", "Deal", dealId, admin.id, { count: result.count });

  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/admin/treasury");
}
