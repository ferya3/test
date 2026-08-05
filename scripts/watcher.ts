/**
 * Chain watcher. Polls each open deal's deposit address for incoming USDT,
 * credits payments, and runs the scheduled state transitions (expiry and
 * auto-release).
 *
 * Run alongside the web server:  npm run watcher
 */
import { runScheduledTransitions } from "../src/lib/deals";
import { purgeExpiredResetTokens } from "../src/lib/password-reset";
import { recordPayment, watchableDeals } from "../src/lib/payments";
import { fetchIncomingUsdt } from "../src/lib/tron";
import { env } from "../src/lib/env";

const POLL_INTERVAL_MS = Number(process.env.WATCHER_INTERVAL_MS ?? 30_000);

async function pass(): Promise<void> {
  const { expired, released, held } = await runScheduledTransitions();
  if (expired || released || held) {
    console.log(`[watcher] expired=${expired} auto-released=${released} held-for-review=${held}`);
  }

  const purgedTokens = await purgeExpiredResetTokens();
  if (purgedTokens) console.log(`[watcher] purged ${purgedTokens} expired reset links`);

  if (env.walletProvider === "mock") return; // no chain to read in mock mode

  const deals = await watchableDeals();
  for (const deal of deals) {
    // Only TRON is polled, and only deals that have an address of their own —
    // a shared treasury address cannot be attributed to one deal.
    if (deal.network !== "TRON" || !deal.depositAddress) continue;
    try {
      // Look slightly before the deal was created to tolerate clock skew.
      const since = deal.createdAt.getTime() - 10 * 60 * 1000;
      const transfers = await fetchIncomingUsdt(deal.depositAddress, since);
      for (const transfer of transfers) {
        const result = await recordPayment({
          dealId: deal.id,
          txHash: transfer.txHash,
          amountMicro: transfer.valueMicro,
          // TronGrid only returns confirmed transfers, so treat them as final.
          confirmations: 1_000,
          fromAddress: transfer.from,
        });
        if (result.funded) console.log(`[watcher] deal ${deal.id} funded (${result.total} micro-USDT)`);
      }
    } catch (error) {
      console.error(`[watcher] ${deal.depositAddress}:`, (error as Error).message);
    }
  }
}

async function main(): Promise<void> {
  console.log(`[watcher] started (provider=${env.walletProvider}, interval=${POLL_INTERVAL_MS}ms)`);
  for (;;) {
    try {
      await pass();
    } catch (error) {
      console.error("[watcher] pass failed:", error);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

void main();
