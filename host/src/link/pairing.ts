import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PairingInvite } from "../protocol/generated/link.js";
import { CONTRACT_VERSION } from "../protocol/generated/contract.js";
import type { Db } from "../store/db.js";
import { LinkError } from "../errors.js";

/** How long a pairing code shown as a QR code can be used. */
export const PAIRING_MINUTES = 10;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export interface HostIdentity {
  hostId: string;
  hostName: string;
  addresses: string[];
  port: number;
  fingerprint: string;
}

/**
 * Pairing happens once, by QR code (openspec mac-link). The QR code carries a one-time code; the phone trades it
 * for a device token, of which the Mac keeps only the hash. Every later request carries the token.
 */
export class Pairing {
  constructor(private readonly db: Db, private readonly now: () => Date = () => new Date()) {}

  invite(identity: HostIdentity): PairingInvite {
    const code = randomBytes(16).toString("base64url");
    const expires = new Date(this.now().getTime() + PAIRING_MINUTES * 60_000).toISOString();
    this.db.prepare("INSERT INTO pairing_codes (code, expires_at) VALUES (?, ?)").run(code, expires);
    return {
      host_id: identity.hostId,
      host_name: identity.hostName,
      addresses: identity.addresses,
      port: identity.port,
      code,
      fingerprint: identity.fingerprint,
      contract: CONTRACT_VERSION
    };
  }

  /** Trades a pairing code for a device token, once. */
  pair(code: string, deviceName: string): string {
    const row = this.db.prepare("SELECT expires_at FROM pairing_codes WHERE code = ?").get(code) as { expires_at: string } | undefined;
    this.db.prepare("DELETE FROM pairing_codes WHERE code = ? OR expires_at < ?").run(code, this.now().toISOString());
    if (!row || row.expires_at < this.now().toISOString()) {
      throw new LinkError("unpaired", "That pairing code has expired or was already used. Run `fantasia pair` on the Mac for a new one.");
    }
    const token = randomBytes(32).toString("base64url");
    this.db.prepare("INSERT INTO devices (id, name, token_hash, paired_at) VALUES (?, ?, ?, ?)").run(randomUUID(), deviceName, hash(token), this.now().toISOString());
    return token;
  }

  /** The paired device a token belongs to, or null. */
  device(token: string | null): { id: string; name: string } | null {
    if (!token) return null;
    return (this.db.prepare("SELECT id, name FROM devices WHERE token_hash = ?").get(hash(token)) as { id: string; name: string } | undefined) ?? null;
  }
}
