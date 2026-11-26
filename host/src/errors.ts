import type { ErrorCode } from "./protocol/generated/link.js";

/** The HTTP status each refusal is sent with. */
export const STATUS: Record<ErrorCode, number> = {
  unpaired: 401,
  version_mismatch: 426,
  busy: 409,
  stale_head: 409,
  not_found: 404,
  invalid: 400,
  model_failed: 502,
  internal: 500
};

/**
 * A request refused for a reason the player can read (openspec mac-link: Every request is answered or refused with
 * a reason). The message is shown as it is, so it is written for the player, not for a log.
 */
export class LinkError extends Error {
  constructor(readonly code: ErrorCode, message: string) {
    super(message);
  }
}
