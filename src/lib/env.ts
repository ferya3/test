import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

function hexKey(name: string): Buffer {
  const value = required(name);
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} must be 64 hex characters (32 bytes). Generate one with: openssl rand -hex 32`);
  }
  return Buffer.from(value, "hex");
}

function positiveInt(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const env = {
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  // Per-IP limits. Raise them if your users sit behind a shared NAT, or lower
  // them if you are being probed.
  rateLimits: {
    registrationsPerHour: positiveInt("RATE_LIMIT_REGISTRATIONS_PER_HOUR", 20),
    loginsPerQuarterHour: positiveInt("RATE_LIMIT_LOGINS_PER_15MIN", 10),
  },
  sessionSecret: required("SESSION_SECRET"),
  credentialMasterKey: () => hexKey("CREDENTIAL_MASTER_KEY"),
  walletProvider: (process.env.WALLET_PROVIDER ?? "mock") as "mock" | "tron",
  tronAccountXpub: process.env.TRON_ACCOUNT_XPUB ?? "",
  tronGridUrl: process.env.TRONGRID_API_URL ?? "https://api.trongrid.io",
  tronGridApiKey: process.env.TRONGRID_API_KEY ?? "",
  usdtContract: process.env.USDT_TRC20_CONTRACT ?? "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  isProduction: process.env.NODE_ENV === "production",
};
