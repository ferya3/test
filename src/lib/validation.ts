import { z } from "zod";

export const CATEGORIES = [
  "GAMING",
  "SOCIAL",
  "SOFTWARE",
  "SUBSCRIPTION",
  "DOMAIN",
  "OTHER",
] as const;

export const CREDENTIAL_KINDS = [
  "USERNAME",
  "PASSWORD",
  "EMAIL",
  "RECOVERY",
  "SECRET",
  "NOTE",
] as const;

const usdtAmount = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,6})?$/, "Enter a USDT amount with up to 6 decimals");

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(255),
  displayName: z.string().trim().min(2, "Display name is too short").max(60),
  password: z
    .string()
    .min(10, "Use at least 10 characters")
    .max(200, "Password is too long")
    .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), "Include at least one letter and one number"),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export const listingSchema = z.object({
  title: z.string().trim().min(6, "Title is too short").max(120),
  category: z.enum(CATEGORIES),
  description: z.string().trim().min(30, "Describe what the buyer receives (30+ characters)").max(4000),
  price: usdtAmount,
});

export const dealSchema = z.object({
  listingId: z.string().trim().optional(),
  sellerEmail: z.string().trim().toLowerCase().email("Enter the seller's account email"),
  title: z.string().trim().min(6, "Title is too short").max(120),
  description: z.string().trim().min(20, "Describe the agreement (20+ characters)").max(4000),
  amount: usdtAmount,
  inspectionHours: z.coerce.number().int().min(1).max(168),
  refundAddress: z.string().trim().min(20, "Enter the address to refund to if the deal fails").max(80),
});

export const credentialSchema = z.object({
  label: z.string().trim().min(2, "Give the item a label").max(80),
  kind: z.enum(CREDENTIAL_KINDS),
  value: z.string().min(1, "Enter the value").max(5000),
});

export const messageSchema = z.object({
  body: z.string().trim().min(1, "Write a message").max(4000),
});

export const disputeSchema = z.object({
  reason: z.string().trim().min(20, "Explain the problem in at least 20 characters").max(2000),
});

export const payoutAddressSchema = z.object({
  payoutAddress: z.string().trim().min(20, "Enter a valid USDT address").max(80),
  payoutNetwork: z.enum(["TRON", "ETHEREUM"]),
});

export const resolveDisputeSchema = z.object({
  outcome: z.enum(["RELEASE_TO_SELLER", "REFUND_BUYER"]),
  resolution: z.string().trim().min(10, "Record why this was decided").max(2000),
});

export const settingsSchema = z.object({
  feeBasisPoints: z.coerce.number().int().min(0).max(2000),
  minDeal: usdtAmount,
  maxDeal: usdtAmount,
  paymentWindowMins: z.coerce.number().int().min(15).max(10080),
  requiredConfirmations: z.coerce.number().int().min(1).max(200),
});

/** Turns a Zod failure into `{ field: message }` for inline form errors. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
