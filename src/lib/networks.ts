/**
 * Network vocabulary shared by the server and the browser. Kept free of any
 * server-only import so forms can render a network picker without pulling the
 * wallet and database layers into the client bundle.
 */
export type Network = "TRON" | "BSC" | "ETHEREUM";

export const NETWORKS: { value: Network; label: string; short: string }[] = [
  { value: "TRON", label: "TRON (TRC-20)", short: "TRC-20" },
  { value: "BSC", label: "BNB Smart Chain (BEP-20)", short: "BEP-20" },
  { value: "ETHEREUM", label: "Ethereum (ERC-20)", short: "ERC-20" },
];

export const NETWORK_VALUES = NETWORKS.map((item) => item.value) as [Network, ...Network[]];

export function networkLabel(network: string): string {
  return NETWORKS.find((item) => item.value === network)?.label ?? network;
}

export function networkShort(network: string): string {
  return NETWORKS.find((item) => item.value === network)?.short ?? network;
}

/** TRON has its own address format; BSC and Ethereum share the EVM one. */
export function isEvmNetwork(network: Network): boolean {
  return network === "BSC" || network === "ETHEREUM";
}
