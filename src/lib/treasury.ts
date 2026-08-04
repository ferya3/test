import "server-only";
import { prisma } from "./db";
import { isValidAddress, type Network } from "./wallet";
import { NETWORKS } from "./networks";

/**
 * The platform's own receiving addresses, one per network, editable by the
 * operator. When a network has an address here, buyers are told to send to it;
 * otherwise the deal falls back to its derived per-deal deposit address.
 *
 * A shared address cannot be matched to a deal automatically — several buyers
 * send to the same place — so deposits against it are credited by hand from the
 * admin console. That trade-off is stated in the UI rather than hidden.
 */
export async function listTreasuryWallets() {
  const rows = await prisma.treasuryWallet.findMany();
  const byNetwork = new Map(rows.map((row) => [row.network, row]));
  return NETWORKS.map((network) => ({
    network: network.value,
    label: network.label,
    address: byNetwork.get(network.value)?.address ?? "",
    note: byNetwork.get(network.value)?.note ?? "",
    updatedAt: byNetwork.get(network.value)?.updatedAt ?? null,
  }));
}

export async function getTreasuryAddress(network: Network): Promise<string | null> {
  const row = await prisma.treasuryWallet.findUnique({ where: { network } });
  return row?.address ?? null;
}

export class TreasuryError extends Error {}

export async function setTreasuryWallet(network: Network, address: string, note: string | null) {
  const trimmed = address.trim();

  // An empty value clears the address, putting that network back on per-deal
  // derived addresses rather than leaving an unusable blank on screen.
  if (!trimmed) {
    await prisma.treasuryWallet.deleteMany({ where: { network } });
    return null;
  }
  if (!isValidAddress(trimmed, network)) {
    throw new TreasuryError("That address is not valid for this network.");
  }

  return prisma.treasuryWallet.upsert({
    where: { network },
    create: { network, address: trimmed, note },
    update: { address: trimmed, note },
  });
}
