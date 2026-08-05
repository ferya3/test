/**
 * The ledger is the part of the platform where a bug costs real money, so it is
 * tested against a live SQLite database rather than mocks.
 *
 * Runs against the throwaway database named in .env.test, which `pretest`
 * deletes and recreates before every run.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { prisma } from "../src/lib/db";
import { postEntry, reconcile, totalLiability, LedgerError } from "../src/lib/ledger";
import { runScheduledTransitions } from "../src/lib/deals";

let counter = 0;
async function makeUser(balance = 0n) {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `ledger-${counter}-${Date.now()}@example.test`,
      displayName: `Ledger User ${counter}`,
      passwordHash: "not-a-real-hash",
    },
  });
  if (balance > 0n) {
    await postEntry({ userId: user.id, amountMicro: balance, kind: "MANUAL_CREDIT", note: "opening balance" });
  }
  return user.id;
}

test("a credit raises the balance and records what it was after", async () => {
  const userId = await makeUser();
  const entry = await postEntry({
    userId,
    amountMicro: 25_000_000n,
    kind: "MANUAL_CREDIT",
    note: "sent to treasury directly",
  });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  assert.equal(user.balanceMicro, 25_000_000n);
  assert.equal(entry.balanceAfterMicro, 25_000_000n);
});

test("a debit lowers the balance", async () => {
  const userId = await makeUser(30_000_000n);
  await postEntry({ userId, amountMicro: -12_000_000n, kind: "MANUAL_DEBIT", note: "correction" });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  assert.equal(user.balanceMicro, 18_000_000n);
});

test("a balance can never be driven below zero", async () => {
  const userId = await makeUser(5_000_000n);
  await assert.rejects(
    () => postEntry({ userId, amountMicro: -5_000_001n, kind: "WITHDRAWAL" }),
    LedgerError,
  );

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  assert.equal(user.balanceMicro, 5_000_000n, "the failed debit must leave the balance untouched");
});

test("a rejected entry writes no ledger row", async () => {
  const userId = await makeUser(1_000_000n);
  const before = await prisma.ledgerEntry.count({ where: { userId } });

  await assert.rejects(() => postEntry({ userId, amountMicro: -9_000_000n, kind: "WITHDRAWAL" }), LedgerError);

  const after = await prisma.ledgerEntry.count({ where: { userId } });
  assert.equal(after, before, "no entry may be left behind by a refused movement");
});

test("zero-value entries are refused", async () => {
  const userId = await makeUser(1_000_000n);
  await assert.rejects(() => postEntry({ userId, amountMicro: 0n, kind: "MANUAL_CREDIT" }), LedgerError);
});

test("the balance always equals the sum of its entries", async () => {
  const userId = await makeUser();
  const movements = [10_000_000n, -3_000_000n, 500_000n, -1_250_000n, 7_000_000n];
  for (const amount of movements) {
    await postEntry({
      userId,
      amountMicro: amount,
      kind: amount > 0n ? "MANUAL_CREDIT" : "MANUAL_DEBIT",
    });
  }

  const expected = movements.reduce((sum, value) => sum + value, 0n);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  assert.equal(user.balanceMicro, expected);

  const entries = await prisma.ledgerEntry.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  const summed = entries.reduce((sum, entry) => sum + entry.amountMicro, 0n);
  assert.equal(summed, expected);
});

test("concurrent debits cannot overdraw the account", async () => {
  const userId = await makeUser(10_000_000n);

  // Five simultaneous attempts to take 4 USDT from a 10 USDT balance. At most
  // two can succeed; the rest must fail rather than push the balance negative.
  const attempts = await Promise.allSettled(
    Array.from({ length: 5 }, () =>
      postEntry({ userId, amountMicro: -4_000_000n, kind: "WITHDRAWAL" }),
    ),
  );

  const succeeded = attempts.filter((result) => result.status === "fulfilled").length;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  assert.ok(user.balanceMicro >= 0n, `balance went negative: ${user.balanceMicro}`);
  assert.equal(user.balanceMicro, 10_000_000n - BigInt(succeeded) * 4_000_000n);
  assert.ok(succeeded <= 2, `expected at most 2 successes, got ${succeeded}`);
});

test("reconcile reports nothing when every balance was written through the ledger", async () => {
  await makeUser(3_000_000n);
  const drift = await reconcile();
  assert.deepEqual(drift, []);
});

test("reconcile catches a balance written behind the ledger's back", async () => {
  const userId = await makeUser(2_000_000n);
  // Simulate the bug the check exists to catch: a direct balance write.
  await prisma.user.update({ where: { id: userId }, data: { balanceMicro: 999_000_000n } });

  const drift = await reconcile();
  const row = drift.find((entry) => entry.userId === userId);
  assert.ok(row, "the tampered account should be reported");
  assert.equal(row.stored, 999_000_000n);
  assert.equal(row.computed, 2_000_000n);

  await prisma.user.update({ where: { id: userId }, data: { balanceMicro: 2_000_000n } });
});

test("total liability adds up every balance the platform owes", async () => {
  const before = await totalLiability();
  await makeUser(6_000_000n);
  await makeUser(4_000_000n);
  assert.equal(await totalLiability(), before + 10_000_000n);
});

/** A DELIVERED deal whose inspection window closed an hour ago. */
async function lapsedDeal(opts: { rejectedItem: boolean }) {
  const buyerId = await makeUser();
  const sellerId = await makeUser();
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const deal = await prisma.deal.create({
    data: {
      reference: `EB-T${(counter += 1).toString().padStart(5, "0")}`,
      buyerId,
      sellerId,
      title: "Lapsed inspection window",
      description: "Delivered, window closed.",
      status: "DELIVERED",
      amountMicro: 105_000_000n,
      feeMicro: 5_000_000n,
      payoutMicro: 100_000_000n,
      network: "BSC",
      deliveredAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      inspectionEndsAt: hourAgo,
      expiresAt: hourAgo,
    },
  });

  await prisma.credential.create({
    data: {
      dealId: deal.id,
      label: "Domain transfer code",
      kind: "SECRET",
      ciphertext: "not-a-real-envelope",
      rejectedAt: opts.rejectedItem ? hourAgo : null,
      rejectedNote: opts.rejectedItem ? "The registrar will not accept this code." : null,
      confirmedAt: opts.rejectedItem ? null : hourAgo,
    },
  });

  return { dealId: deal.id, sellerId };
}

test("a lapsed window releases to the seller when nothing was rejected", async () => {
  const { dealId } = await lapsedDeal({ rejectedItem: false });
  await runScheduledTransitions();
  const after = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  assert.equal(after.status, "COMPLETED");
});

test("a rejected item stops the clock from paying the seller", async () => {
  // The buyer reported a problem. Releasing on a timer would take the money off
  // the one person who spoke up, so the deal has to wait for an operator.
  const { dealId, sellerId } = await lapsedDeal({ rejectedItem: true });
  const result = await runScheduledTransitions();

  const after = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  assert.equal(after.status, "DELIVERED");
  assert.ok(result.held >= 1, "the deal should be counted as held for review");

  const seller = await prisma.user.findUniqueOrThrow({ where: { id: sellerId } });
  assert.equal(seller.balanceMicro, 0n);
});
