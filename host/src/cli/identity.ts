import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

/** The port the Mac listens on unless told otherwise; fixed, so the phone's last address that worked keeps working. */
export const DEFAULT_PORT = 8765;

export interface Identity {
  hostId: string;
  hostName: string;
  port: number;
}

/** Who this Mac is to its phones: an id made once and kept, its name, and the port it serves on. */
export function identity(home: string, port?: number): Identity {
  const file = join(home, "host.json");
  const stored = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Partial<Identity>) : {};
  const result: Identity = {
    hostId: stored.hostId ?? randomUUID(),
    hostName: hostname().replace(/\.local$/, ""),
    port: port ?? stored.port ?? DEFAULT_PORT
  };
  writeFileSync(file, JSON.stringify(result, null, 2));
  return result;
}
