import "server-only";
import { HDKey } from "@scure/bip32";
import { base58check } from "@scure/base";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { createHash } from "node:crypto";
import { env } from "./env";
import { isEvmNetwork, type Network } from "./networks";

export {
  NETWORKS,
  NETWORK_VALUES,
  networkLabel,
  networkShort,
  isEvmNetwork,
  type Network,
} from "./networks";

/**
 * Deposit addresses are derived from a *watch-only* account xpub. No private
 * key material exists on the web server: sweeping escrowed funds is an offline
 * treasury operation, so a full compromise of this box cannot move money.
 */
export interface WalletProvider {
  deriveDepositAddress(index: number, network: Network): string;
}

const b58check = base58check(nobleSha256);

/** Tron address = base58check(0x41 ‖ last-20-bytes(keccak256(uncompressed pubkey[1:]))). */
export function tronAddressFromPublicKey(publicKey: Uint8Array): string {
  if (publicKey.length !== 65 || publicKey[0] !== 0x04) {
    throw new Error("Expected a 65-byte uncompressed secp256k1 public key");
  }
  const hash = keccak_256(publicKey.slice(1));
  const payload = new Uint8Array(21);
  payload[0] = 0x41;
  payload.set(hash.slice(-20), 1);
  return b58check.encode(payload);
}

export function isValidTronAddress(address: string): boolean {
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) return false;
  try {
    const decoded = b58check.decode(address);
    return decoded.length === 21 && decoded[0] === 0x41;
  } catch {
    return false;
  }
}

export function isValidEvmAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

/** EVM address = 0x ‖ last-20-bytes(keccak256(uncompressed pubkey[1:])). */
export function evmAddressFromPublicKey(publicKey: Uint8Array): string {
  if (publicKey.length !== 65 || publicKey[0] !== 0x04) {
    throw new Error("Expected a 65-byte uncompressed secp256k1 public key");
  }
  const hash = keccak_256(publicKey.slice(1));
  return `0x${Buffer.from(hash.slice(-20)).toString("hex")}`;
}

export function isValidAddress(address: string, network: Network): boolean {
  return isEvmNetwork(network) ? isValidEvmAddress(address) : isValidTronAddress(address);
}

export function addressHint(network: Network): string {
  return isEvmNetwork(network)
    ? "That is not a valid address for this network (it should start with 0x)."
    : "That is not a valid TRC-20 address (it should start with T).";
}

class XpubWallet implements WalletProvider {
  private readonly account: HDKey;

  constructor(xpub: string) {
    this.account = HDKey.fromExtendedKey(xpub);
    if (this.account.privateKey) {
      throw new Error("TRON_ACCOUNT_XPUB must be a public (watch-only) key, never an xprv");
    }
  }

  deriveDepositAddress(index: number, network: Network): string {
    // BIP-44 receive chain, relative to the account xpub: .../0/<index>.
    const child = this.account.deriveChild(0).deriveChild(index);
    if (!child.publicKey) throw new Error("Failed to derive deposit key");
    const publicKey = uncompress(child.publicKey);
    // The same key yields both formats; only the encoding differs per chain.
    return isEvmNetwork(network) ? evmAddressFromPublicKey(publicKey) : tronAddressFromPublicKey(publicKey);
  }
}

/** @scure/bip32 exposes compressed keys; Tron addresses need the full point. */
function uncompress(compressed: Uint8Array): Uint8Array {
  return secp256k1.Point.fromBytes(compressed).toBytes(false);
}

/**
 * Development stand-in. Produces stable, obviously-fake addresses so the whole
 * escrow flow can be exercised without a treasury wallet. Payments are marked
 * received from the admin console instead of by the chain watcher.
 */
class MockWallet implements WalletProvider {
  deriveDepositAddress(index: number, network: Network): string {
    const digest = createHash("sha256").update(`sedo-mock-${network}-${index}`).digest();
    if (isEvmNetwork(network)) {
      return `0x${digest.subarray(0, 20).toString("hex")}`;
    }
    const payload = new Uint8Array(21);
    payload[0] = 0x41;
    payload.set(digest.subarray(0, 20), 1);
    return b58check.encode(payload);
  }
}

let cached: WalletProvider | null | undefined;

/**
 * The wallet that derives a fresh address per deal, or `null` when there is
 * none — which is a perfectly good way to run the platform: deposits then go to
 * the shared treasury address the operator publishes, and are credited by hand.
 *
 * The mock wallet is never handed out in production. Rather than crashing the
 * request, this returns null there and the caller falls back to the treasury
 * address, refusing the deal only if neither exists.
 */
export function getWallet(): WalletProvider | null {
  if (cached !== undefined) return cached;

  if (env.walletProvider === "tron") {
    if (!env.tronAccountXpub) {
      throw new Error("WALLET_PROVIDER=tron requires TRON_ACCOUNT_XPUB");
    }
    cached = new XpubWallet(env.tronAccountXpub);
  } else {
    cached = env.isProduction ? null : new MockWallet();
  }
  return cached;
}

/** Throws where a derived address is genuinely required, such as the seed. */
export function requireWallet(): WalletProvider {
  const wallet = getWallet();
  if (!wallet) throw new Error("No derived-address wallet is configured (set TRON_ACCOUNT_XPUB)");
  return wallet;
}

const EXPLORERS: Record<Network, { tx: string; address: string }> = {
  TRON: { tx: "https://tronscan.org/#/transaction/", address: "https://tronscan.org/#/address/" },
  BSC: { tx: "https://bscscan.com/tx/", address: "https://bscscan.com/address/" },
  ETHEREUM: { tx: "https://etherscan.io/tx/", address: "https://etherscan.io/address/" },
};

export function explorerTxUrl(network: Network, txHash: string): string {
  return `${(EXPLORERS[network] ?? EXPLORERS.TRON).tx}${txHash}`;
}

export function explorerAddressUrl(network: Network, address: string): string {
  return `${(EXPLORERS[network] ?? EXPLORERS.TRON).address}${address}`;
}
