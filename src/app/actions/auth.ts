"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import {
  audit,
  clientIp,
  createSession,
  destroySession,
  hashPassword,
  requireUser,
  revokeSessions,
  verifyPassword,
} from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { env } from "@/lib/env";
import {
  changePasswordSchema,
  fieldErrors,
  forgotPasswordSchema,
  loginSchema,
  payoutAddressSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validation";
import { consumePasswordReset, requestPasswordReset, ResetError } from "@/lib/password-reset";
import { addressHint, isValidAddress, type Network } from "@/lib/wallet";

export type FormState = { errors?: Record<string, string>; message?: string; ok?: boolean };

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    displayName: formData.get("displayName"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const ip = clientIp(await headers()) ?? "unknown";
  if (!rateLimit(`register:${ip}`, env.rateLimits.registrationsPerHour, 60 * 60 * 1000)) {
    return { errors: { form: "Too many sign-up attempts. Try again later." } };
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { errors: { email: "An account with that email already exists." } };

  // The first account to register owns the platform; everyone after is a user.
  const isFirstUser = (await prisma.user.count()) === 0;

  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      passwordHash: await hashPassword(parsed.data.password),
      role: isFirstUser ? "ADMIN" : "USER",
    },
  });

  await audit("user.register", "User", user.id, user.id, { role: user.role });
  await createSession(user.id);
  redirect("/dashboard");
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const ip = clientIp(await headers()) ?? "unknown";
  const loginLimit = env.rateLimits.loginsPerQuarterHour;
  if (!rateLimit(`login:${ip}`, loginLimit, 15 * 60 * 1000) || !rateLimit(`login:${parsed.data.email}`, loginLimit, 15 * 60 * 1000)) {
    return { errors: { form: "Too many attempts. Please wait a few minutes." } };
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  // Same generic message either way, so the form cannot be used to enumerate accounts.
  const invalid = { errors: { form: "Email or password is incorrect." } };
  if (!user) {
    await hashPassword(parsed.data.password); // equalise timing against a missing account
    return invalid;
  }
  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) return invalid;
  if (user.isBlocked) return { errors: { form: "This account has been suspended. Contact support." } };

  await audit("user.login", "User", user.id, user.id);
  await createSession(user.id);
  redirect(safeNext(formData.get("next")));
}

/**
 * Only same-site paths are accepted as a post-login destination, so a crafted
 * `?next=https://elsewhere` cannot turn the login form into an open redirect.
 */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

/**
 * Starts a password reset. Always reports success, whether or not the address
 * belongs to an account — otherwise the form would be a way to find out who is
 * registered here.
 */
export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const ip = clientIp(await headers());
  const done = {
    ok: true,
    message:
      "If that email belongs to an account, a reset link is on its way. It expires in an hour, and it only works once.",
  };

  // Rate-limited per address as well as per IP, so the endpoint cannot be used
  // to flood one person's inbox.
  if (!rateLimit(`forgot:${ip ?? "unknown"}`, 10, 60 * 60 * 1000)) return done;
  if (!rateLimit(`forgot:${parsed.data.email}`, 3, 60 * 60 * 1000)) return done;

  await requestPasswordReset(parsed.data.email, ip);
  return done;
}

/** Finishes a reset: sets the new password and signs the account out everywhere. */
export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const ip = clientIp(await headers()) ?? "unknown";
  if (!rateLimit(`reset:${ip}`, 20, 60 * 60 * 1000)) {
    return { errors: { form: "Too many attempts. Try again later." } };
  }

  let userId: string;
  try {
    userId = await consumePasswordReset(parsed.data.token, parsed.data.newPassword);
  } catch (error) {
    if (error instanceof ResetError) return { errors: { form: error.message } };
    throw error;
  }
  await audit("user.password_reset_self", "User", userId, userId);

  redirect("/login?reset=1");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}

/**
 * A user changes their own password. Every other session is signed out, so a
 * password change actually evicts whoever prompted it — the whole point when
 * someone suspects their account is compromised.
 */
export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  // Rate-limited because the form takes the current password: without this a
  // stolen session could be used to brute-force it.
  if (!rateLimit(`password:${user.id}`, 10, 60 * 60 * 1000)) {
    return { errors: { form: "Too many attempts. Try again later." } };
  }

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const record = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(parsed.data.currentPassword, record.passwordHash))) {
    return { errors: { currentPassword: "That is not your current password." } };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) },
  });
  const revoked = await revokeSessions(user.id, true);
  await audit("user.password_change", "User", user.id, user.id, { sessionsRevoked: revoked });

  return {
    ok: true,
    message:
      revoked > 0
        ? `Password changed. ${revoked} other session${revoked === 1 ? " was" : "s were"} signed out.`
        : "Password changed.",
  };
}

export async function savePayoutAddressAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = payoutAddressSchema.safeParse({
    payoutAddress: formData.get("payoutAddress"),
    payoutNetwork: formData.get("payoutNetwork"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const network = parsed.data.payoutNetwork as Network;
  if (!isValidAddress(parsed.data.payoutAddress, network)) {
    return { errors: { payoutAddress: addressHint(network) } };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { payoutAddress: parsed.data.payoutAddress, payoutNetwork: network },
  });
  await audit("user.payout_address_set", "User", user.id, user.id, { network });

  return { ok: true, message: "Payout address saved." };
}
