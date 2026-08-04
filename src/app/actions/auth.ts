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
  verifyPassword,
} from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { env } from "@/lib/env";
import { fieldErrors, loginSchema, payoutAddressSchema, registerSchema } from "@/lib/validation";
import { isValidAddress, type Network } from "@/lib/wallet";

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
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
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
    return {
      errors: {
        payoutAddress:
          network === "TRON"
            ? "That is not a valid TRC-20 address (it should start with T)."
            : "That is not a valid ERC-20 address (it should start with 0x).",
      },
    };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { payoutAddress: parsed.data.payoutAddress, payoutNetwork: network },
  });
  await audit("user.payout_address_set", "User", user.id, user.id, { network });

  return { ok: true, message: "Payout address saved." };
}
