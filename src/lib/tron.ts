import "server-only";
import { env } from "./env";

export type Trc20Transfer = {
  txHash: string;
  from: string;
  to: string;
  valueMicro: bigint;
  blockTimestamp: number;
  confirmed: boolean;
};

type TronGridTransfer = {
  transaction_id: string;
  from: string;
  to: string;
  value: string;
  block_timestamp: number;
  type: string;
  token_info?: { address?: string; decimals?: number };
};

/**
 * Reads incoming USDT (TRC-20) transfers for one address from TronGrid.
 *
 * Only transfers of the configured contract are returned — otherwise a
 * worthless look-alike token sent to the deposit address could be mistaken for
 * payment, which is the classic fake-deposit attack on escrow services.
 */
export async function fetchIncomingUsdt(address: string, sinceMs: number): Promise<Trc20Transfer[]> {
  const url = new URL(`/v1/accounts/${address}/transactions/trc20`, env.tronGridUrl);
  url.searchParams.set("only_to", "true");
  url.searchParams.set("only_confirmed", "true");
  url.searchParams.set("contract_address", env.usdtContract);
  url.searchParams.set("min_timestamp", String(sinceMs));
  url.searchParams.set("limit", "50");

  const response = await fetch(url, {
    headers: env.tronGridApiKey ? { "TRON-PRO-API-KEY": env.tronGridApiKey } : {},
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`TronGrid responded ${response.status} for ${address}`);
  }

  const payload = (await response.json()) as { data?: TronGridTransfer[] };
  const transfers: Trc20Transfer[] = [];

  for (const item of payload.data ?? []) {
    if (item.type !== "Transfer") continue;
    if (item.to !== address) continue;
    if (item.token_info?.address !== env.usdtContract) continue;
    // USDT is 6-decimal, matching our micro unit exactly. Anything else would
    // need rescaling, so refuse it rather than mis-credit a deal.
    if ((item.token_info?.decimals ?? 6) !== 6) continue;

    transfers.push({
      txHash: item.transaction_id,
      from: item.from,
      to: item.to,
      valueMicro: BigInt(item.value),
      blockTimestamp: item.block_timestamp,
      confirmed: true,
    });
  }

  return transfers;
}
