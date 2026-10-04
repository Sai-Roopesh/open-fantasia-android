import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect } from "node:tls";
import { afterEach, describe, expect, it } from "vitest";
import { Engine } from "../../src/engine/engine.js";
import { Pairing } from "../../src/link/pairing.js";
import { buildLink } from "../../src/link/server.js";
import { ensureCertificate } from "../../src/link/tls.js";
import { Models } from "../../src/models/model-call.js";
import { freshHome } from "../support/host.js";

/** Connects the way the phone does: trusting exactly the certificate with [pinned] as its fingerprint. */
function pinnedConnect(port: number, pinned: string): Promise<"trusted" | "refused"> {
  return new Promise(resolve => {
    const socket = connect({ host: "127.0.0.1", port, rejectUnauthorized: false }, () => {
      const seen = socket.getPeerCertificate().fingerprint256.replace(/:/g, "").toLowerCase();
      socket.end();
      resolve(seen === pinned ? "trusted" : "refused");
    });
    socket.on("error", () => resolve("refused"));
  });
}

const closers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

describe("the Mac's certificate", () => {
  it("is made once and kept", async () => {
    const home = mkdtempSync(join(tmpdir(), "tls-"));
    const first = await ensureCertificate(home);
    const second = await ensureCertificate(home);
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(first.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is trusted by a client pinned to its fingerprint and refused by one pinned to another", async () => {
    const mac = freshHome();
    const certificate = await ensureCertificate(mac.home);
    const app = buildLink({ mac, engine: new Engine(mac, new Models(mac.db, {})), pairing: new Pairing(mac.db), hostId: "mac-1", hostName: "Test Mac", https: certificate });
    await app.listen({ port: 0, host: "127.0.0.1" });
    closers.push(() => app.close());
    const port = (app.server.address() as AddressInfo).port;
    expect(await pinnedConnect(port, certificate.fingerprint)).toBe("trusted");
    expect(await pinnedConnect(port, "0".repeat(64))).toBe("refused");
  });
});
