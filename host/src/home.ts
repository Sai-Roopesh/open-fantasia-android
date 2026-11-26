import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Where the Mac keeps everything: the store, Portraits, the certificate, the pairing state. One folder, so a
 * backup is a copy of it. FANTASIA_HOME points tests and experiments somewhere else.
 */
export function fantasiaHome(): string {
  const home = process.env.FANTASIA_HOME ?? join(homedir(), "Library", "Application Support", "Open Fantasia");
  mkdirSync(home, { recursive: true });
  return home;
}
