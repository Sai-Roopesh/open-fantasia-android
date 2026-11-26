import { X509Certificate } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generate } from "selfsigned";

export interface Certificate {
  key: string;
  cert: string;
  /** Lower-case hex SHA-256 of the certificate, which the pairing QR code carries and the phone pins. */
  fingerprint: string;
}

/** Lower-case hex SHA-256 of a PEM certificate's DER bytes, the form the phone compares against. */
export function fingerprintOf(certPem: string): string {
  return new X509Certificate(certPem).fingerprint256.replace(/:/g, "").toLowerCase();
}

/**
 * The Mac's certificate: made once on first run and kept. It is self-signed, which is safe because the phone trusts
 * it by its fingerprint, learned from the QR code, and trusts no other: a network in between can neither read the
 * link nor stand in for the Mac.
 */
export async function ensureCertificate(home: string): Promise<Certificate> {
  const keyFile = join(home, "link-key.pem");
  const certFile = join(home, "link-cert.pem");
  if (!existsSync(keyFile) || !existsSync(certFile)) {
    const made = await generate([{ name: "commonName", value: "Open Fantasia" }], {
      keySize: 2048,
      algorithm: "sha256",
      notAfterDate: new Date(Date.now() + 20 * 365 * 24 * 3600 * 1000)
    });
    writeFileSync(keyFile, made.private, { mode: 0o600 });
    writeFileSync(certFile, made.cert);
  }
  const cert = readFileSync(certFile, "utf8");
  return { key: readFileSync(keyFile, "utf8"), cert, fingerprint: fingerprintOf(cert) };
}
