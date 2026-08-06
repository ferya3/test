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
const BUYER_BSC_ADDRESS = "0x3Ab5C7d9E1f2A4b6C8d0E2f4A6b8C0d2E4f6A8b0";

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

/**
 * Reads the reset link out of the dev server's log, which is where the
 * "console" mail provider writes it.
 */
async function waitForResetLink(email: string): Promise<string> {
  const logPath = process.env.E2E_DEV_LOG ?? "";
  if (!logPath) throw new Error("Set E2E_DEV_LOG to the dev server log to run this test");

  const { readFileSync } = await import("node:fs");
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const log = readFileSync(logPath, "utf8");
    const section = log.lastIndexOf(`To:      ${email}`);
    if (section !== -1) {
      const match = log.slice(section).match(/http:\/\/\S+\/reset-password\?token=\S+/);
      if (match) return match[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No reset link for ${email} appeared in ${logPath}`);
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
  await page.selectOption("#network", "TRON");
  await page.fill("#refundAddress", BUYER_REFUND_ADDRESS);
  await page.click('button:has-text("Open deal")');

  await expect(page).toHaveURL(/\/deals\/(?!new$)[a-z0-9]{16,}$/);
  const dealUrl = page.url();

  // The buyer sees a deposit address and the escrow breakdown: a 250 sale
  // price plus the 5% fee is 262.50 funded, with the seller still getting 250.
  await expect(page.getByText("Awaiting payment")).toBeVisible();
  await expect(page.getByText("262.5 USDT").first()).toBeVisible();
  await expect(page.getByText("12.5 USDT")).toBeVisible();
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

  // Check every vault item off; the counter tracks progress.
  await expect(page.getByText("0 of 3 confirmed")).toBeVisible();
  for (let i = 0; i < 3; i += 1) {
    await page.getByRole("button", { name: "This one works" }).first().click();
    await expect(page.getByText(`${i + 1} of 3 confirmed`)).toBeVisible();
  }

  page.once("dialog", (dialog) => dialog.accept());
  await page.click('button:has-text("Release funds to seller")');
  await expect(page.getByText("Completed").first()).toBeVisible();
  await expect(page.getByText("Settlement")).toBeVisible();
  await signOut(page);

  // --- the payout landed on the seller's balance -----------------------------
  await signIn(page, SELLER.email, SELLER.password);
  await page.goto("/dashboard/wallet");
  await expect(page.getByText("250 USDT").first()).toBeVisible();
  await expect(page.getByText("Deal payout").first()).toBeVisible();

  // --- and the seller can withdraw it ----------------------------------------
  await page.fill("#amount", "100");
  await page.fill("#toAddress", SELLER_PAYOUT_ADDRESS);
  page.once("dialog", (dialog) => dialog.accept());
  await page.click('button:has-text("Request withdrawal")');
  await expect(page.getByText("Withdrawal requested.")).toBeVisible();
  // The balance drops immediately, so the same funds cannot be requested twice.
  await expect(page.getByText("150 USDT").first()).toBeVisible();
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
  await page.selectOption("#network", "TRON");
  await page.fill("#refundAddress", BUYER_REFUND_ADDRESS);
  await page.click('button:has-text("Open deal")');
  await expect(page).toHaveURL(/\/deals\/(?!new$)[a-z0-9]{16,}$/);

  page.once("dialog", (dialog) => dialog.accept());
  await page.click('button:has-text("Fund from balance")');
  await expect(page.getByText("Funds in escrow")).toBeVisible();

  // 300 credited − 126 spent (120 price + 5% fee) leaves 174 on the balance.
  await page.goto("/dashboard/wallet");
  await expect(page.getByText("174 USDT").first()).toBeVisible();
  await expect(page.getByText("Deal funded").first()).toBeVisible();
});

test("an operator can undo a credit sent to the wrong account", async ({ page }) => {
  const wrong = { email: `misdirected-${STAMP}@example.test`, name: "Wrong Account", password: "escrow-test-1" };

  await register(page, wrong);
  await signOut(page);

  await signIn(page, ADMIN.email, ADMIN.password);
  await page.goto(`/admin/users?q=${encodeURIComponent(wrong.email)}`);
  await page.getByText(wrong.email).click();

  // A figure with a thousands separator is what the page itself displays, so
  // it has to be accepted back.
  await page.fill("#amount", "1,250.50");
  await page.fill("#reason", "Deposit credited on arrival");
  page.once("dialog", (dialog) => dialog.accept());
  await page.click('button:has-text("Credit balance")');
  await expect(page.getByText("Credited 1,250.5 USDT.")).toBeVisible();

  // Zeroing takes the balance from the account rather than from a retyped
  // number, so the operator cannot leave a residue behind.
  await page.selectOption("#direction", "ZERO");
  await page.fill("#reason", "Credited the wrong account, reversing");
  page.once("dialog", (dialog) => dialog.accept());
  await page.click('button:has-text("Zero the balance")');
  await expect(page.getByText("Took 1,250.5 USDT off the balance. It is now zero.")).toBeVisible();

  // Refusing a second attempt keeps a stray zero-value entry off the ledger.
  await page.selectOption("#direction", "ZERO");
  await page.fill("#reason", "Credited the wrong account, reversing");
  page.once("dialog", (dialog) => dialog.accept());
  await page.click('button:has-text("Zero the balance")');
  await expect(page.getByText("That balance is already zero.")).toBeVisible();

  await signOut(page);
  await signIn(page, wrong.email, wrong.password);
  await page.goto("/dashboard/wallet");
  await expect(page.getByText("Manual debit").first()).toBeVisible();
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
  await register(page, {
    email: `nobalance-${STAMP}@example.test`,
    name: "No Balance",
    password: "escrow-test-1",
  });
  await page.goto("/admin/users");
  await expect(page.getByText("Nothing here")).toBeVisible();
});

test("a rejected vault item blocks a clean release", async ({ page }) => {
  test.slow();

  const buyer = { email: `partial-buyer-${STAMP}@example.test`, name: "Partial Buyer", password: "escrow-test-1" };
  const seller = { email: `partial-seller-${STAMP}@example.test`, name: "Partial Seller", password: "escrow-test-1" };

  await register(page, seller);
  await signOut(page);
  await register(page, buyer);

  await page.goto("/deals/new");
  await page.fill("#sellerEmail", seller.email);
  await page.fill("#title", "Two handles sold as one lot");
  await page.fill("#description", "Both handles with their recovery email, handed over together.");
  await page.fill("#amount", "400");
  await page.selectOption("#network", "BSC");
  await page.fill("#refundAddress", BUYER_BSC_ADDRESS);
  await page.click('button:has-text("Open deal")');
  await expect(page).toHaveURL(/\/deals\/(?!new$)[a-z0-9]{16,}$/);
  const dealUrl = page.url();

  // A BEP-20 deal asks for a 0x address and says so on the deposit panel.
  await expect(page.getByText("Deposit address · BEP-20")).toBeVisible();
  await signOut(page);

  await signIn(page, ADMIN.email, ADMIN.password);
  await page.goto("/admin");
  const dealId = dealUrl.split("/").pop()!;
  await page
    .locator("li", { has: page.locator(`a[href="/deals/${dealId}"]`) })
    .getByRole("button", { name: "Mark as paid" })
    .click();
  await signOut(page);

  await signIn(page, seller.email, seller.password);
  await page.goto(dealUrl);
  const values = page.locator('input[name="value"]');
  await values.nth(0).fill("handle_one");
  await values.nth(1).fill("handle_two_password");
  await page.click('button:has-text("Deliver to buyer")');
  await expect(page.getByText("Delivered — inspection")).toBeVisible();
  await signOut(page);

  await signIn(page, buyer.email, buyer.password);
  await page.goto(dealUrl);

  await page.getByRole("button", { name: "This one works" }).first().click();
  await expect(page.getByText("1 of 2 confirmed")).toBeVisible();

  await page.getByRole("button", { name: "Report a problem" }).first().click();
  await page.getByPlaceholder("What is wrong with it?").fill("The second handle is disabled by the provider.");
  await page.getByRole("button", { name: "Report", exact: true }).click();

  await expect(page.getByText("1 of 2 confirmed · 1 rejected")).toBeVisible();
  await expect(page.getByText("Not working", { exact: true })).toBeVisible();
  await expect(page.getByText("The second handle is disabled by the provider.")).toBeVisible();

  // Release is still possible, but the buyer is warned what it costs them.
  await expect(page.getByText(/1 of 2 items in the vault are still unconfirmed/)).toBeVisible();
});

test("an operator can set the platform's receiving address per network", async ({ page }) => {
  await signIn(page, ADMIN.email, ADMIN.password);
  await page.goto("/admin/settings");

  await expect(page.getByText("BNB Smart Chain (BEP-20)").first()).toBeVisible();

  const bscAddress = "0x1111111111111111111111111111111111111111";
  await page.fill("#address-BSC", bscAddress);
  await page.locator("form", { has: page.locator("#address-BSC") }).getByRole("button").click();
  await expect(page.getByText("BEP-20 address saved.")).toBeVisible();

  // A TRON address on a BEP-20 network must be refused, not silently stored.
  await page.fill("#address-BSC", SELLER_PAYOUT_ADDRESS);
  await page.locator("form", { has: page.locator("#address-BSC") }).getByRole("button").click();
  await expect(page.getByText("That address is not valid for this network.")).toBeVisible();
});

test("a user changes their own password and the old one stops working", async ({ page }) => {
  test.slow();

  const account = {
    email: `pwd-${STAMP}@example.test`,
    name: "Password Changer",
    password: "escrow-test-1",
  };
  const newPassword = "brand-new-secret-42";

  await register(page, account);
  await page.goto("/dashboard/settings");

  // The current password has to be right, or nothing happens.
  await page.fill("#currentPassword", "not-my-password");
  await page.fill("#newPassword", newPassword);
  await page.fill("#confirmPassword", newPassword);
  await page.click('button:has-text("Change password")');
  await expect(page.getByText("That is not your current password.")).toBeVisible();

  // And the two new entries have to agree.
  await page.fill("#currentPassword", account.password);
  await page.fill("#newPassword", newPassword);
  await page.fill("#confirmPassword", "something-else-99");
  await page.click('button:has-text("Change password")');
  await expect(page.getByText("The two passwords do not match")).toBeVisible();

  await page.fill("#currentPassword", account.password);
  await page.fill("#newPassword", newPassword);
  await page.fill("#confirmPassword", newPassword);
  await page.click('button:has-text("Change password")');
  await expect(page.getByText(/Password changed/)).toBeVisible();

  // The change keeps this session alive but retires the old password.
  await signOut(page);
  await page.goto("/login");
  await page.fill("#email", account.email);
  await page.fill("#password", account.password);
  await page.click('button[type="submit"]');
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();

  await signIn(page, account.email, newPassword);
});

test("an operator resets a password and the user is signed out everywhere", async ({ page, browser }) => {
  test.slow();

  const account = {
    email: `reset-${STAMP}@example.test`,
    name: "Locked Out",
    password: "escrow-test-1",
  };
  const issued = "operator-issued-77";

  await register(page, account);
  await expect(page).toHaveURL(/\/dashboard/);

  // A separate browser context stands in for the user's other device — it needs
  // its own cookie jar, or signing in as the admin here would replace it.
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await signIn(other, account.email, account.password);
  await expect(other.getByRole("heading", { name: /Welcome back/ })).toBeVisible();

  await signOut(page);
  await signIn(page, ADMIN.email, ADMIN.password);
  await page.goto(`/admin/users?q=${encodeURIComponent(account.email)}`);
  await page.getByText(account.email).click();

  // A reason is mandatory — an unexplained reset is indistinguishable from a
  // takeover — and the browser refuses to submit without one.
  await page.fill("#resetPassword", issued);
  page.once("dialog", (dialog) => dialog.accept());
  await page.click('button:has-text("Set password")');
  await expect(page.locator("#resetReason")).toHaveJSProperty("validity.valueMissing", true);
  await expect(page.getByText(/Password set for/)).toHaveCount(0);

  await page.fill("#resetPassword", issued);
  await page.fill("#resetReason", "Lost access, identity verified over email");
  page.once("dialog", (dialog) => dialog.accept());
  await page.click('button:has-text("Set password")');
  await expect(page.getByText(new RegExp(`Password set for ${account.email}`))).toBeVisible();

  // The other device is now signed out.
  await other.goto("/dashboard");
  await expect(other).toHaveURL(/\/login/);
  await otherContext.close();

  await signOut(page);
  await signIn(page, account.email, issued);
});

test("a forgotten password can be reset through the emailed link", async ({ page, browser }) => {
  test.slow();

  const account = {
    email: `forgot-${STAMP}@example.test`,
    name: "Forgetful User",
    password: "escrow-test-1",
  };
  const newPassword = "recovered-access-88";

  await register(page, account);

  // A second context stands in for a device left signed in elsewhere.
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await signIn(other, account.email, account.password);
  await expect(other.getByRole("heading", { name: /Welcome back/ })).toBeVisible();

  await signOut(page);
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password/);

  // An unknown address gets exactly the same answer, so the form cannot be
  // used to discover who has an account here.
  await page.fill("#email", "definitely-not-registered@example.test");
  await page.click('button:has-text("Send reset link")');
  const reassurance = /If that email belongs to an account/;
  await expect(page.getByText(reassurance)).toBeVisible();

  await page.goto("/forgot-password");
  await page.fill("#email", account.email);
  await page.click('button:has-text("Send reset link")');
  await expect(page.getByText(reassurance)).toBeVisible();

  // The console mail provider prints the link; pull it from the server log.
  // The link is built from APP_URL, which points at the normal dev port; the
  // test server runs on its own, so only the path and token are reused.
  const emailed = new URL(await waitForResetLink(account.email));
  const link = `${emailed.pathname}${emailed.search}`;
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Set a new password" })).toBeVisible();

  await page.fill("#newPassword", newPassword);
  await page.fill("#confirmPassword", "not-the-same-11");
  await page.click('button:has-text("Set new password")');
  await expect(page.getByText("The two passwords do not match")).toBeVisible();

  await page.fill("#newPassword", newPassword);
  await page.fill("#confirmPassword", newPassword);
  await page.click('button:has-text("Set new password")');
  await expect(page).toHaveURL(/\/login\?reset=1/);
  await expect(page.getByText("Your password has been changed.")).toBeVisible();

  // The device that was left signed in is now out.
  await other.goto("/dashboard");
  await expect(other).toHaveURL(/\/login/);
  await otherContext.close();

  // The link is single use.
  await page.goto(link);
  await expect(page.getByText("This link is no longer valid.")).toBeVisible();

  await signIn(page, account.email, newPassword);
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
  // Registers its own account so the test does not depend on an earlier one.
  await register(page, {
    email: `curious-${STAMP}@example.test`,
    name: "Curious User",
    password: "escrow-test-1",
  });

  for (const path of ["/admin", "/admin/treasury", "/admin/users", "/admin/settings"]) {
    await page.goto(path);
    await expect(page.getByText("Nothing here")).toBeVisible();
  }
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

test("a funded deal produces an invoice the buyer can open", async ({ page, browser }) => {
  test.slow();

  const buyer = { email: `inv-buyer-${STAMP}@example.test`, name: "Invoice Buyer", password: "escrow-test-1" };
  const seller = { email: `inv-seller-${STAMP}@example.test`, name: "Invoice Seller", password: "escrow-test-1" };

  await register(page, seller);
  await signOut(page);
  await register(page, buyer);

  // 800 sale price at the seeded 5% is 40 fee, so the buyer funds 840.
  await page.goto("/deals/new");
  await page.fill("#sellerEmail", seller.email);
  await page.fill("#title", "Aged domain with clean history");
  await page.fill("#description", "Registrar transfer code plus account access.");
  await page.fill("#amount", "800");
  await page.selectOption("#network", "BSC");
  await page.fill("#refundAddress", BUYER_BSC_ADDRESS);
  await page.click('button:has-text("Open deal")');
  await expect(page).toHaveURL(/\/deals\/(?!new$)[a-z0-9]{16,}$/);
  const dealUrl = page.url();
  await signOut(page);

  // Before funding, the invoice says so rather than claiming payment.
  await signIn(page, ADMIN.email, ADMIN.password);
  await page.goto(`${dealUrl}/invoice`);
  await expect(page.getByText("has not been funded yet")).toBeVisible();

  const dealId = dealUrl.split("/").pop()!;
  await page.goto("/admin");
  await page
    .locator("li", { has: page.locator(`a[href="/deals/${dealId}"]`) })
    .getByRole("button", { name: "Mark as paid" })
    .click();
  await expect(page.locator("li", { has: page.locator(`a[href="/deals/${dealId}"]`) })).toContainText(
    "Funds in escrow",
  );
  await signOut(page);

  await signIn(page, buyer.email, buyer.password);
  await page.goto(dealUrl);
  await page.click('a:has-text("Invoice")');
  await expect(page).toHaveURL(/\/invoice$/);

  // The three figures are the whole point of the document.
  await expect(page.getByText("800.00", { exact: true })).toBeVisible();
  await expect(page.getByText("40.00", { exact: true })).toBeVisible();
  await expect(page.getByText("840.00", { exact: true })).toBeVisible();
  await expect(page.getByText("Escrow service fee (5%)")).toBeVisible();
  // The site chrome is hidden by CSS so the page reads as the document alone.
  // It stays in the DOM, so this is a visibility check, not a count.
  await expect(page.locator("header").filter({ hasText: "Marketplace" })).not.toBeVisible();
  await expect(page.getByText("Seychelles")).toBeVisible();
  await expect(page.getByText(buyer.email)).toBeVisible();

  // An invoice carries both parties' names and amounts, so it must not be
  // readable by anyone who is not on the deal.
  const outsider = await browser.newContext();
  const outsiderPage = await outsider.newPage();
  await register(outsiderPage, {
    email: `inv-stranger-${STAMP}@example.test`,
    name: "Invoice Stranger",
    password: "escrow-test-1",
  });
  await outsiderPage.goto(`${dealUrl}/invoice`);
  await expect(outsiderPage.getByText("Nothing here")).toBeVisible();
  await outsider.close();
});

test("the imprint names the operator", async ({ page }) => {
  await page.goto("/imprint");
  await expect(page.getByRole("heading", { name: "Imprint" })).toBeVisible();
  await expect(page.getByText("Victoria, Mahé")).toBeVisible();
  await expect(page.getByText("Seychelles")).toBeVisible();
});
