import { execFileSync } from "node:child_process";

/** The Mac keychain service the host keeps its secrets under. */
const SERVICE = "com.openfantasia.host";
export const CLAUDE_TOKEN = "claude-oauth-token";

/**
 * Reads a secret from the Mac keychain, or null when it is not there. CLAUDE_CODE_OAUTH_TOKEN in the environment
 * stands in for the stored Claude token, for running by hand.
 */
export function readSecret(account: string): string | null {
  if (account === CLAUDE_TOKEN && process.env.CLAUDE_CODE_OAUTH_TOKEN) return process.env.CLAUDE_CODE_OAUTH_TOKEN;
  try {
    return execFileSync("/usr/bin/security", ["find-generic-password", "-s", SERVICE, "-a", account, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

/** Stores a secret in the Mac keychain, replacing any earlier one. */
export function storeSecret(account: string, label: string, value: string): void {
  execFileSync("/usr/bin/security", ["add-generic-password", "-U", "-s", SERVICE, "-a", account, "-l", label, "-w", value], { stdio: "ignore" });
}
