/**
 * USDT has 6 decimals on every chain we support, so all amounts are handled as
 * integer micro-USDT (1 USDT = 1_000_000). No floating point ever touches a
 * balance.
 */
export const MICRO = 1_000_000n;

export function parseUsdt(input: string): bigint {
  const trimmed = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) {
    throw new Error("Enter an amount in USDT with at most 6 decimal places");
  }
  const [whole, fraction = ""] = trimmed.split(".");
  return BigInt(whole) * MICRO + BigInt(fraction.padEnd(6, "0"));
}

export function formatUsdt(micro: bigint | number | string): string {
  const value = typeof micro === "bigint" ? micro : BigInt(micro);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / MICRO;
  const fraction = (abs % MICRO).toString().padStart(6, "0").replace(/0+$/, "");
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}${fraction ? `.${fraction}` : ""}`;
}

/** Rounds down, so the platform never over-charges a fee by a sub-unit. */
export function feeFor(amountMicro: bigint, basisPoints: number): bigint {
  return (amountMicro * BigInt(basisPoints)) / 10_000n;
}
