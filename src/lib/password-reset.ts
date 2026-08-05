import "server-only";
import { prisma } from "./db";
import { randomToken, sha256 } from "./crypto";
import { hashPassword, revokeSessions } from "./auth";
import { passwordResetMail, sendMail } from "./mailer";
import { env } from "./env";

export const RESET_TTL_MINUTES = 60;

/**
 * Issues a reset link and emails it.
 *
 * Deliberately returns nothing useful: the caller shows the same message
 * whether or not the address belongs to an account, so the form cannot be used
 * to find out who is registered here. Delivery problems are logged rather than
 * surfaced, for the same reason.
 */
export async function requestPasswordReset(email: string, ip: string | null): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });

  // A blocked account is not a route back in — the operator has to lift the
  // block first, otherwise a reset would quietly undo a suspension.
  if (!user || user.isBlocked) return;

  // One live link at a time, so an older email cannot still be used after the
  // user asks again.
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });

  const token = randomToken();
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000),
      requestIp: ip,
    },
  });

  const link = `${env.appUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;

  try {
    await sendMail(passwordResetMail(user.email, user.displayName, link, RESET_TTL_MINUTES));
  } catch (error) {
    console.error("[password-reset] could not send the email:", (error as Error).message);
  }
}

export class ResetError extends Error {}

type ResetRecord = { id: string; userId: string };

async function findUsableToken(token: string): Promise<ResetRecord> {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: sha256(token) },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new ResetError("That link has expired or has already been used. Ask for a new one.");
  }
  return { id: record.id, userId: record.userId };
}

/** True when the link is still good — used to decide whether to show the form. */
export async function isResetTokenUsable(token: string): Promise<boolean> {
  try {
    await findUsableToken(token);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sets the new password and burns the link. Every session the user has is
 * destroyed: whoever locked them out loses their access at the same moment.
 */
export async function consumePasswordReset(token: string, newPassword: string): Promise<string> {
  const record = await findUsableToken(token);
  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    // Guarded on usedAt so two simultaneous submissions cannot both win.
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new ResetError("That link has already been used. Ask for a new one.");
    }
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
  });

  await revokeSessions(record.userId);
  return record.userId;
}

/** Housekeeping for the watcher: drop links nobody can use any more. */
export async function purgeExpiredResetTokens(): Promise<number> {
  const result = await prisma.passwordResetToken.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
  return result.count;
}
