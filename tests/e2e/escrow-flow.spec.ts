/**
 * End-to-end walk through the escrow lifecycle, exercised through the real UI:
 *
 *   register buyer + seller → buyer opens a deal → admin marks it paid →
 *   seller delivers credentials → buyer reveals them → buyer releases →
 *   payout lands in the treasury queue.
 *
 * Run against a server started with a seeded database:  npm run test:e2e
 */
import { test, expect, type Page } from "@playwright/test";

const STAMP = Date.now();
const BUYER = { email: `buyer-${STAMP}@example.test`, name: "E2E Buyer", password: "escrow-test-1" };
const SELLER = { email: `seller-${STAMP}@example.test`, name: "E2E Seller", password: "escrow-test-1" };
const ADMIN = { email: "admin@escrowbridge.test", password: "escrow-demo-1" };

// Deterministic TRON addresses used for the refund and payout destinations.
const BUYER_REFUND_ADDRESS = "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8";
const SELLER_PAYOUT_ADDRESS = "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE";

async function register(page: Page, user: { email: string; name: string; password: string }) {
  await page.goto("/register");
  await page.fill("#displayName", user.name);
  await page.fill("#email", user.email);
  await page.fill("#password", user.password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard/);
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard/);
}

async function signOut(page: Page) {
  await page.click('button:has-text("Sign out")');
  await expect(page).toHaveURL("/");
}

test("a deal runs from funding through delivery to payout", async ({ page }) => {
  test.slow();

  // --- seller signs up and sets a payout address ------------------------------
  await register(page, SELLER);
  await page.goto("/dashboard/settings");
  await page.fill("#payoutAddress", SELLER_PAYOUT_ADDRESS);
  await page.click('button:has-text("Save payout address")');
  await expect(page.getByText("Payout address saved.")).toBeVisible();
  await signOut(page);

  // --- buyer signs up and opens a deal ---------------------------------------
  await register(page, BUYER);
  await page.goto("/deals/new");
  await page.fill("#sellerEmail", SELLER.email);
  await page.fill("#title", "Level 240 gaming account with cosmetics");
  await page.fill(
    "#description",
    "Full account handover including the registered email and recovery codes, transferred within 24 hours.",
  );
  await page.fill("#amount", "250.00");
  await page.fill("#refundAddress", BUYER_REFUND_ADDRESS);
  await page.click('button:has-text("Open deal")');

  await expect(page).toHaveURL(/\/deals\/(?!new$)[a-z0-9]{16,}$/);
  const dealUrl = page.url();

  // The buyer sees a deposit address and the escrow breakdown (3% platform fee).
  await expect(page.getByText("Awaiting payment")).toBeVisible();
  await expect(page.getByText("250 USDT").first()).toBeVisible();
  await expect(page.getByText("242.5 USDT")).toBeVisible();
  await expect(page.locator("text=/^T[1-9A-HJ-NP-Za-km-z]{33}$/").first()).toBeVisible();

  // The vault must not exist yet — nothing has been delivered.
  await expect(page.getByText("Credential vault")).toHaveCount(0);
  await signOut(page);

  // --- admin confirms the (mock) payment -------------------------------------
  await signIn(page, ADMIN.email, ADMIN.password);
  await page.goto("/admin");
  const dealId = dealUrl.split("/").pop()!;
  await page
    .locator("li", { has: page.locator(`a[href="/deals/${dealId}"]`) })
    .getByRole("button", { name: "Mark as paid" })
    .click();
  await expect(page.locator("li", { has: page.locator(`a[href="/deals/${dealId}"]`) })).toContainText(
    "Funds in escrow",
  );
  await signOut(page);

  // --- seller delivers the credentials ---------------------------------------
  await signIn(page, SELLER.email, SELLER.password);
  await page.goto(dealUrl);
  await expect(page.getByText("Deliver the credentials")).toBeVisible();

  const values = page.locator('input[name="value"]');
  await values.nth(0).fill("player_nine");
  await values.nth(1).fill("hunter2-but-longer");
  await values.nth(2).fill("owner@mailbox.test");
  await page.click('button:has-text("Deliver to buyer")');

  // Delivery moves the deal on, so the form is replaced by the vault.
  await expect(page.getByText("Delivered — inspection")).toBeVisible();
  await expect(page.getByText("Deliver the credentials")).toHaveCount(0);

  // The seller can see the labels but must not be able to read the values back.
  await expect(page.getByText("Credential vault")).toBeVisible();
  await expect(page.getByText("Locked").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Reveal" })).toHaveCount(0);
  await signOut(page);

  // --- buyer inspects and releases -------------------------------------------
  await signIn(page, BUYER.email, BUYER.password);
  await page.goto(dealUrl);
  await expect(page.getByText("Delivered — inspection")).toBeVisible();

  await page.getByRole("button", { name: "Reveal" }).first().click();
  await expect(page.getByText("player_nine")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.click('button:has-text("Release funds to seller")');
  await expect(page.getByText("Completed").first()).toBeVisible();
  await expect(page.getByText("Settlement")).toBeVisible();
  await signOut(page);

  // --- the payout landed on the seller's balance -----------------------------
  await signIn(page, SELLER.email, SELLER.password);
  await page.goto("/dashboard/wallet");
  await expect(page.getByText("242.5 USDT").first()).toBeVisible();
  await expect(page.getByText("Deal payout").first()).toBeVisible();

  // --- and the seller can withdraw it ----------------------------------------
  await page.fill("#amount", "100");
  await page.fill("#toAddress", SELLER_PAYOUT_ADDRESS);
  page.once("dialog", (dialog) => dialog.accept());
  await page.click('button:has-text("Request withdrawal")');
  await expect(page.getByText("Withdrawal requested.")).toBeVisible();
  // The balance drops immediately, so the same funds cannot be requested twice.
  await expect(page.getByText("142.5 USDT").first()).toBeVisible();
  await signOut(page);

  // --- the request shows up in the treasury queue ----------------------------
  await signIn(page, ADMIN.email, ADMIN.password);
  await page.goto("/admin/treasury");
  const row = page.locator("li", { hasText: SELLER.email }).first();
  await expect(row).toContainText("100 USDT");
  await expect(row).toContainText("Awaiting review");
});

test("an operator can credit a balance by hand and the buyer can spend it", async ({ page }) => {
  test.slow();

  const buyer = { email: `credit-buyer-${STAMP}@example.test`, name: "Credit Buyer", password: "escrow-test-1" };
  const seller = { email: `credit-seller-${STAMP}@example.test`, name: "Credit Seller", password: "escrow-test-1" };

  await register(page, seller);
  await signOut(page);
  await register(page, buyer);
  await signOut(page);

  // The operator credits the buyer for USDT that arrived outside a deal.
  await signIn(page, ADMIN.email, ADMIN.password);
  await page.goto(`/admin/users?q=${encodeURIComponent(buyer.email)}`);
  await page.getByText(buyer.email).click();
  await expect(page.getByRole("heading", { name: buyer.name })).toBeVisible();

  await page.fill("#amount", "300");
  await page.fill("#reason", "Sent USDT straight to the treasury wallet");
  await page.fill("#reference", "0xdeadbeefcafe");
  page.once("dialog", (dialog) => dialog.accept());
  await page.click('button:has-text("Credit balance")');
  await expect(page.getByText("Credited 300 USDT.")).toBeVisible();

  // A manual credit must be attributable, so it appears on the ledger with its reason.
  await expect(page.getByText("Sent USDT straight to the treasury wallet").first()).toBeVisible();
  await signOut(page);

  // The buyer spends that credit on a deal instead of waiting for a transfer.
  await signIn(page, buyer.email, buyer.password);
  await expect(page.getByText("300 USDT").first()).toBeVisible();

  await page.goto("/deals/new");
  await page.fill("#sellerEmail", seller.email);
  await page.fill("#title", "Subscription workspace handover");
  await page.fill("#description", "Owner account plus the billing inbox, transferred the same day.");
  await page.fill("#amount", "120");
  await page.fill("#refundAddress", BUYER_REFUND_ADDRESS);
  await page.click('button:has-text("Open deal")');
  await expect(page).toHaveURL(/\/deals\/(?!new$)[a-z0-9]{16,}$/);

  page.once("dialog", (dialog) => dialog.accept());
  await page.click('button:has-text("Fund from balance")');
  await expect(page.getByText("Funds in escrow")).toBeVisible();

  // 300 credited − 120 spent leaves 180 on the balance.
  await page.goto("/dashboard/wallet");
  await expect(page.getByText("180 USDT").first()).toBeVisible();
  await expect(page.getByText("Deal funded").first()).toBeVisible();
});

test("a user cannot withdraw more than their balance", async ({ page }) => {
  const pauper = { email: `pauper-${STAMP}@example.test`, name: "No Funds", password: "escrow-test-1" };
  await register(page, pauper);

  await page.goto("/dashboard/wallet");
  await page.fill("#amount", "500");
  await page.fill("#toAddress", SELLER_PAYOUT_ADDRESS);
  page.once("dialog", (dialog) => dialog.accept());
  await page.click('button:has-text("Request withdrawal")');

  await expect(page.getByText("Your balance does not cover that amount.")).toBeVisible();
  await expect(page.getByText("0 USDT").first()).toBeVisible();
});

test("an ordinary user cannot reach the balance controls", async ({ page }) => {
  await signIn(page, `pauper-${STAMP}@example.test`, "escrow-test-1");
  await page.goto("/admin/users");
  await expect(page.getByText("Nothing here")).toBeVisible();
});

test("a stranger cannot open someone else's deal", async ({ page }) => {
  await register(page, {
    email: `nosy-${STAMP}@example.test`,
    name: "Nosy Stranger",
    password: "escrow-test-1",
  });

  await signOut(page);
  await signIn(page, ADMIN.email, ADMIN.password);
  await page.goto("/admin");
  const href = await page.locator('a[href^="/deals/"]').first().getAttribute("href");
  await signOut(page);

  await signIn(page, `nosy-${STAMP}@example.test`, "escrow-test-1");
  await page.goto(href!);
  await expect(page.getByText("Nothing here")).toBeVisible();
});

test("the admin console is invisible to ordinary users", async ({ page }) => {
  await signIn(page, `buyer-${STAMP}@example.test`, BUYER.password);
  await page.goto("/admin");
  await expect(page.getByText("Nothing here")).toBeVisible();
  await page.goto("/admin/treasury");
  await expect(page.getByText("Nothing here")).toBeVisible();
});

test("a signed-out visitor is sent to sign in, then on to the page they wanted", async ({ page }) => {
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/login\?next=/);

  await page.fill("#email", ADMIN.email);
  await page.fill("#password", ADMIN.password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Operations overview" })).toBeVisible();
});

test("the post-login redirect cannot be pointed off-site", async ({ page }) => {
  await page.goto("/login?next=https://example.com/phish");
  await page.fill("#email", ADMIN.email);
  await page.fill("#password", ADMIN.password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard$/);
});
