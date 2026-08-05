import { z } from "zod";
import { NETWORK_VALUES } from "./networks";

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

/** One rule for password strength, applied wherever a password is set. */
const strongPassword = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(200, "Password is too long")
  .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), "Include at least one letter and one number");

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(255),
  displayName: z.string().trim().min(2, "Display name is too short").max(60),
  password: strongPassword,
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(255),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(10),
    newPassword: strongPassword,
    confirmPassword: z.string().min(1, "Repeat the new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "The two passwords do not match",
    path: ["confirmPassword"],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: strongPassword,
    confirmPassword: z.string().min(1, "Repeat the new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "The two passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "Choose a password you have not used here before",
    path: ["newPassword"],
  });

/**
 * An admin setting someone else's password is a serious act — it hands them
 * the ability to sign in as that user — so it carries a mandatory reason.
 */
export const adminSetPasswordSchema = z.object({
  userId: z.string().trim().min(1),
  newPassword: strongPassword,
  reason: z.string().trim().min(6, "Record why you are resetting this password").max(500),
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
  network: z.enum(NETWORK_VALUES),
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
  payoutNetwork: z.enum(NETWORK_VALUES),
});

export const resolveDisputeSchema = z.object({
  outcome: z.enum(["RELEASE_TO_SELLER", "REFUND_BUYER"]),
  resolution: z.string().trim().min(10, "Record why this was decided").max(2000),
});

export const settingsSchema = z.object({
  feeBasisPoints: z.coerce.number().int().min(0).max(2000),
  minDeal: usdtAmount,
  maxDeal: usdtAmount,
  minWithdrawal: usdtAmount,
  paymentWindowMins: z.coerce.number().int().min(15).max(10080),
  requiredConfirmations: z.coerce.number().int().min(1).max(200),
  showcaseUsers: z.coerce.number().int().min(0).max(10_000_000),
  showcaseDeals: z.coerce.number().int().min(0).max(10_000_000),
});

/**
 * A manual balance change always carries a reason — an unexplained movement is
 * indistinguishable from theft when the books are audited later.
 */
export const adjustBalanceSchema = z.object({
  userId: z.string().trim().min(1),
  direction: z.enum(["CREDIT", "DEBIT"]),
  amount: usdtAmount.refine((v) => Number(v) > 0, "Enter an amount above zero"),
  reason: z.string().trim().min(6, "Say why you are changing this balance").max(500),
  reference: z.string().trim().max(120).optional(),
  /** Which chain the money arrived on, when it arrived on one. */
  network: z.enum(NETWORK_VALUES).optional(),
  /** The address the user sent from, for matching against the explorer. */
  fromAddress: z.string().trim().max(80).optional(),
});

export const treasuryWalletSchema = z.object({
  network: z.enum(NETWORK_VALUES),
  address: z.string().trim().max(80),
  note: z.string().trim().max(200).optional(),
});

/** Buyer's verdict on one item in the vault. */
export const confirmItemSchema = z.object({
  credentialId: z.string().trim().min(1),
  verdict: z.enum(["CONFIRM", "REJECT", "RESET"]),
  note: z.string().trim().max(500).optional(),
});

export const withdrawalSchema = z.object({
  amount: usdtAmount,
  toAddress: z.string().trim().min(20, "Enter a valid USDT address").max(80),
  network: z.enum(NETWORK_VALUES),
});

export const rejectWithdrawalSchema = z.object({
  reason: z.string().trim().min(6, "Give the user a reason").max(500),
});

export const txHashSchema = z.object({
  txHash: z.string().trim().min(10, "Enter the transaction hash").max(120),
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
