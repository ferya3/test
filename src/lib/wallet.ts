import "server-only";
import { HDKey } from "@scure/bip32";
import { base58check } from "@scure/base";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { createHash } from "node:crypto";
import { env } from "./env";

export type Network = "TRON" | "ETHEREUM";

/**
 * Deposit addresses are derived from a *watch-only* account xpub. No private
 * key material exists on the web server: sweeping escrowed funds is an offline
 * treasury operation, so a full compromise of this box cannot move money.
 */
export interface WalletProvider {
  readonly network: Network;
  deriveDepositAddress(index: number): string;
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

export function isValidAddress(address: string, network: Network): boolean {
  return network === "TRON" ? isValidTronAddress(address) : isValidEvmAddress(address);
}

class TronXpubWallet implements WalletProvider {
  readonly network = "TRON" as const;
  private readonly account: HDKey;

  constructor(xpub: string) {
    this.account = HDKey.fromExtendedKey(xpub);
    if (this.account.privateKey) {
      throw new Error("TRON_ACCOUNT_XPUB must be a public (watch-only) key, never an xprv");
    }
  }

  deriveDepositAddress(index: number): string {
    // BIP-44 receive chain: m/44'/195'/0'/0/<index>, relative to the account xpub.
    const child = this.account.deriveChild(0).deriveChild(index);
    if (!child.publicKey) throw new Error("Failed to derive deposit key");
    return tronAddressFromPublicKey(uncompress(child.publicKey));
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
  readonly network = "TRON" as const;

  deriveDepositAddress(index: number): string {
    const digest = createHash("sha256").update(`escrowbridge-mock-${index}`).digest();
    const payload = new Uint8Array(21);
    payload[0] = 0x41;
    payload.set(digest.subarray(0, 20), 1);
    return b58check.encode(payload);
  }
}

let cached: WalletProvider | undefined;

export function getWallet(): WalletProvider {
  if (cached) return cached;
  if (env.walletProvider === "tron") {
    if (!env.tronAccountXpub) {
      throw new Error("WALLET_PROVIDER=tron requires TRON_ACCOUNT_XPUB");
    }
    cached = new TronXpubWallet(env.tronAccountXpub);
  } else {
    if (env.isProduction) {
      throw new Error("WALLET_PROVIDER=mock must never be used in production");
    }
    cached = new MockWallet();
  }
  return cached;
}

export function explorerTxUrl(network: Network, txHash: string): string {
  return network === "TRON"
    ? `https://tronscan.org/#/transaction/${txHash}`
    : `https://etherscan.io/tx/${txHash}`;
}

export function explorerAddressUrl(network: Network, address: string): string {
  return network === "TRON"
    ? `https://tronscan.org/#/address/${address}`
    : `https://etherscan.io/address/${address}`;
}
