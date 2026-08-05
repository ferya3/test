import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { randomToken, sha256 } from "./crypto";

export const SESSION_COOKIE = "eb_session";
const SESSION_TTL_DAYS = 14;

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  payoutAddress: string | null;
  payoutNetwork: string;
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string): Promise<void> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const headerList = await headers();

  await prisma.session.create({
    data: {
      userId,
      // Only the hash is stored, so a database dump cannot be replayed as a login.
      tokenHash: sha256(token),
      expiresAt,
      userAgent: headerList.get("user-agent")?.slice(0, 255) ?? null,
      ip: clientIp(headerList),
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/**
 * Signs a user out everywhere. `exceptCurrent` keeps the caller's own session
 * alive, which is what you want after someone changes their own password: every
 * other device is kicked out, but they are not logged out of the one they are
 * using.
 */
export async function revokeSessions(userId: string, exceptCurrent = false): Promise<number> {
  let currentHash: string | undefined;
  if (exceptCurrent) {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (token) currentHash = sha256(token);
  }

  const result = await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(currentHash ? { NOT: { tokenHash: currentHash } } : {}),
    },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  cookieStore.delete(SESSION_COOKIE);
}

/** Cached per request so a page rendering many components hits the DB once. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.user.isBlocked) return null;

  return {
    id: session.user.id,
    email: session.user.email,
    displayName: session.user.displayName,
    role: session.user.role,
    payoutAddress: session.user.payoutAddress,
    payoutNetwork: session.user.payoutNetwork,
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("You must be signed in to do that.");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new AuthError("Administrator access required.");
  return user;
}

export class AuthError extends Error {}

export function clientIp(headerList: Headers): string | null {
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headerList.get("x-real-ip");
}

export async function audit(
  action: string,
  entity: string,
  entityId: string,
  actorId: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const headerList = await headers();
  await prisma.auditLog.create({
    data: {
      action,
      entity,
      entityId,
      actorId,
      metadata: metadata ? JSON.stringify(metadata) : null,
      ip: clientIp(headerList),
    },
  });
}
