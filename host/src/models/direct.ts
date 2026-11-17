import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ModelRunner, ModelUsage } from "./model-call.js";

/**
 * The direct transport cannot be used for this call, for a reason the provider's own tool can mend: its sign-in has
 * expired, or was never made. The call goes to that tool instead, which renews the sign-in as it works.
 */
export class UseFallback extends Error {}

/**
 * The direct transport first, and the provider's own tool when the direct one cannot be signed in (docs/adr/0023).
 * Only a sign-in problem falls back: any other failure is the call's, and is reported as it is, so a broken direct
 * path is seen rather than hidden behind a quieter one.
 */
export function preferDirect(direct: ModelRunner, fallback: ModelRunner): ModelRunner {
  return {
    ...(direct.canLookUp ? { canLookUp: direct.canLookUp } : {}),
    run: async (request, onText, signal, tools, onUsage, onWire) => {
      try {
        return await direct.run(request, onText, signal, tools, onUsage, onWire);
      } catch (error) {
        if (!(error instanceof UseFallback)) throw error;
        return fallback.run(request, onText, signal, tools, onUsage);
      }
    }
  };
}

/** Reads a server-sent event stream, handing each `data:` line's JSON to [onEvent] as it arrives. */
export async function readEvents(response: Response, onEvent: (event: Record<string, unknown>) => void): Promise<void> {
  if (!response.body) return;
  const decoder = new TextDecoder();
  let pending = "";
  const take = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    try { onEvent(JSON.parse(data) as Record<string, unknown>); } catch { /* A line that is not JSON carries nothing we read. */ }
  };
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    pending += decoder.decode(chunk, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    lines.forEach(take);
  }
  take(pending + decoder.decode());
}

/** A provider's refusal of a call that is not about its sign-in, with the HTTP status it came with. */
export class Refused extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Why a provider refused a call, in the provider's own words where it gave some. */
export async function refusal(provider: string, response: Response): Promise<Error> {
  const body = await response.text().catch(() => "");
  let said = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string; detail?: string };
    said = (typeof parsed.error === "string" ? parsed.error : parsed.error?.message) ?? parsed.detail ?? said;
  } catch { /* Not JSON: the raw words are the best there is. */ }
  if (response.status === 401 || response.status === 403) return new UseFallback(`${provider} sign-in was refused (${response.status}): ${said}`);
  if (response.status === 429) return new Refused(`${provider} usage limit reached: ${said}`, 429);
  return new Refused(`${provider} answered ${response.status}: ${said}`, response.status);
}

const SOON = 60_000;

/**
 * What a call used, summed over every request it made: a call that looks things up makes several, and each is billed.
 * The same four numbers for every provider, as each reported them; nothing is estimated.
 */
export class Used {
  private total = { input_tokens: 0, cached_tokens: 0, output_tokens: 0, reasoning_tokens: 0, requests: 0 };

  add(input: unknown, cached: unknown, output: unknown, reasoning: unknown): ModelUsage {
    const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
    this.total = {
      input_tokens: this.total.input_tokens + number(input),
      cached_tokens: this.total.cached_tokens + number(cached),
      output_tokens: this.total.output_tokens + number(output),
      reasoning_tokens: this.total.reasoning_tokens + number(reasoning),
      requests: this.total.requests + 1
    };
    return { ...this.total };
  }
}

export interface CodexCredentials {
  token: string;
  accountId: string;
}

/** The ChatGPT sign-in the Codex CLI keeps in `~/.codex/auth.json`, while its token is still good. */
export function codexCredentials(file = join(homedir(), ".codex", "auth.json"), now = Date.now()): CodexCredentials {
  let auth: { tokens?: { access_token?: string; account_id?: string } };
  try {
    auth = JSON.parse(readFileSync(file, "utf8")) as typeof auth;
  } catch {
    throw new UseFallback("Codex is not signed in with ChatGPT on this Mac");
  }
  const token = auth.tokens?.access_token;
  const accountId = auth.tokens?.account_id;
  if (!token || !accountId) throw new UseFallback("Codex is not signed in with ChatGPT on this Mac");
  const expires = jwtExpiry(token);
  if (expires !== null && expires - SOON < now) throw new UseFallback("The Codex sign-in has expired");
  return { token, accountId };
}

function jwtExpiry(token: string): number | null {
  try {
    const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { exp?: number };
    return typeof claims.exp === "number" ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** The Google sign-in Antigravity keeps in the Mac keychain, while its token is still good. */
export function antigravityToken(read: () => string = readAntigravityKeychain, now = Date.now()): string {
  let stored: { token?: { access_token?: string; expiry?: string } };
  try {
    const raw = read().trim();
    const encoded = raw.startsWith("go-keyring-base64:") ? raw.slice("go-keyring-base64:".length) : raw;
    stored = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(encoded, "base64").toString("utf8")) as typeof stored;
  } catch {
    throw new UseFallback("Antigravity is not signed in on this Mac");
  }
  const token = stored.token?.access_token;
  if (!token) throw new UseFallback("Antigravity is not signed in on this Mac");
  const expiry = stored.token?.expiry ? Date.parse(stored.token.expiry) : NaN;
  if (!Number.isNaN(expiry) && expiry - SOON < now) throw new UseFallback("The Antigravity sign-in has expired");
  return token;
}

function readAntigravityKeychain(): string {
  return execFileSync("/usr/bin/security", ["find-generic-password", "-s", "gemini", "-a", "antigravity", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}
