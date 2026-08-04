"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit, requireAdmin } from "@/lib/auth";
import { parseUsdt } from "@/lib/money";
import { purgedEnvelope } from "@/lib/crypto";
import { refundBuyer, releaseToSeller } from "@/lib/deals";
import { fieldErrors, resolveDisputeSchema, settingsSchema } from "@/lib/validation";
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
      await releaseToSeller(dealId, `Dispute resolved for the seller by ${admin.email}`);
    } else {
      await refundBuyer(dealId, `Dispute resolved for the buyer by ${admin.email}`);
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

/** Treasury operator records the hash of a transfer they broadcast by hand. */
export async function markTransferSentAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const kind = String(formData.get("kind"));
  const id = String(formData.get("id"));
  const txHash = String(formData.get("txHash") ?? "").trim();
  if (!txHash || txHash.length > 120) return;

  if (kind === "payout") {
    await prisma.payout.update({
      where: { id },
      data: { status: "SENT", txHash, sentAt: new Date() },
    });
  } else if (kind === "refund") {
    await prisma.refund.update({
      where: { id },
      data: { status: "SENT", txHash, sentAt: new Date() },
    });
  } else {
    return;
  }

  await audit(`${kind}.sent`, kind === "payout" ? "Payout" : "Refund", id, admin.id, { txHash });
  revalidatePath("/admin");
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
}

export async function updateSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = settingsSchema.safeParse({
    feeBasisPoints: formData.get("feeBasisPoints"),
    minDeal: formData.get("minDeal"),
    maxDeal: formData.get("maxDeal"),
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
  revalidatePath("/admin");
}
