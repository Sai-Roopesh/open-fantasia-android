import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const HOST_PROTOCOL_VERSION = 1;
export const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
export const JOB_TIMEOUT_MILLIS = 30 * 60 * 1000;
export const DIAGNOSTIC_RETENTION_MILLIS = 7 * 24 * 60 * 60 * 1000;
export const UNACKNOWLEDGED_RETENTION_MILLIS = 30 * 24 * 60 * 60 * 1000;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function requestPayloadHash(request) {
  return sha256(canonicalJson(request));
}

export function tokenHash(token, pepper = "") {
  return sha256(`open-fantasia-device-v1:${pepper}:${token}`);
}

export function safeTokenEquals(leftHash, token, pepper = "") {
  const rightHash = tokenHash(token, pepper);
  const left = Buffer.from(leftHash, "hex");
  const right = Buffer.from(rightHash, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function generateCredential() {
  return `ofc_${randomBytes(32).toString("base64url")}`;
}

export function generatePairingCode() {
  return randomBytes(9).toString("base64url").toUpperCase();
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function atomicWriteJson(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = join(dirname(path), `.${randomUUID()}.tmp`);
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, path);
}

export class DeviceRegistry {
  constructor(root, now = () => Date.now(), pepper = "") {
    this.root = root;
    this.now = now;
    this.pepper = pepper;
    this.devicesPath = join(root, "devices.json");
    this.pairingsPath = join(root, "pairings.json");
  }

  async init() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    if (!(await readJson(this.devicesPath, null))) await atomicWriteJson(this.devicesPath, []);
    if (!(await readJson(this.pairingsPath, null))) await atomicWriteJson(this.pairingsPath, []);
  }

  async createPairing({ endpoint, ttlMillis = 10 * 60 * 1000 }) {
    const code = generatePairingCode();
    const pairings = (await readJson(this.pairingsPath, [])).filter(item => item.expires_at > this.now());
    pairings.push({
      id: randomUUID(),
      code_hash: sha256(`open-fantasia-pair-v1:${this.pepper}:${code}`),
      endpoint,
      created_at: this.now(),
      expires_at: this.now() + ttlMillis
    });
    await atomicWriteJson(this.pairingsPath, pairings);
    return { code, endpoint, expires_at: pairings.at(-1).expires_at };
  }

  async redeemPairing({ code, deviceName }) {
    const pairings = await readJson(this.pairingsPath, []);
    const wanted = sha256(`open-fantasia-pair-v1:${this.pepper}:${code.trim().toUpperCase()}`);
    const index = pairings.findIndex(item => item.expires_at > this.now() && item.code_hash === wanted);
    if (index < 0) throw new Error("Pairing code is invalid or expired");
    const pairing = pairings[index];
    pairings.splice(index, 1);
    await atomicWriteJson(this.pairingsPath, pairings);

    const credential = generateCredential();
    const device = {
      id: randomUUID(),
      name: String(deviceName || "Android phone").slice(0, 80),
      token_hash: tokenHash(credential, this.pepper),
      created_at: this.now(),
      revoked_at: null
    };
    const devices = await readJson(this.devicesPath, []);
    devices.push(device);
    await atomicWriteJson(this.devicesPath, devices);
    return {
      protocol_version: HOST_PROTOCOL_VERSION,
      endpoint: pairing.endpoint,
      device_id: device.id,
      credential
    };
  }

  async authenticate(credential) {
    if (!credential) return null;
    const devices = await readJson(this.devicesPath, []);
    return devices.find(device => !device.revoked_at && safeTokenEquals(device.token_hash, credential, this.pepper)) ?? null;
  }

  async listDevices() {
    return (await readJson(this.devicesPath, [])).map(({ token_hash: _, ...device }) => device);
  }

  async revokeDevice(deviceId) {
    const devices = await readJson(this.devicesPath, []);
    const index = devices.findIndex(device => device.id === deviceId);
    if (index < 0) return false;
    devices[index] = { ...devices[index], revoked_at: this.now() };
    await atomicWriteJson(this.devicesPath, devices);
    return true;
  }
}

export class DurableJobStore {
  constructor(root, now = () => Date.now()) {
    this.root = root;
    this.jobsRoot = join(root, "jobs");
    this.now = now;
    this.nextSequence = 0;
  }

  async init() {
    await mkdir(this.jobsRoot, { recursive: true, mode: 0o700 });
    for (const id of await this.#jobIds()) {
      const state = await this.getState(id);
      this.nextSequence = Math.max(this.nextSequence, Number(state?.sequence ?? 0) + 1);
      if (state?.status === "running" || state?.status === "generating" || state?.status === "validating") {
        await this.updateState(id, { status: "queued", recovered_after_restart: true });
      }
    }
  }

  #jobDir(id) { return join(this.jobsRoot, id); }
  #statePath(id) { return join(this.#jobDir(id), "state.json"); }
  #requestPath(id) { return join(this.#jobDir(id), "request.json"); }
  #responsePath(id) { return join(this.#jobDir(id), "response.json"); }

  async #jobIds() {
    try {
      return (await readdir(this.jobsRoot, { withFileTypes: true }))
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
  }

  async createOrGet(request, deviceId) {
    if (request.protocol_version !== HOST_PROTOCOL_VERSION) {
      const error = new Error("Protocol version mismatch");
      error.code = "INCOMPATIBLE";
      throw error;
    }
    const id = request.request_id;
    if (!id || !/^[A-Za-z0-9._:-]{1,160}$/.test(id)) throw new Error("Invalid request identity");
    const payloadHash = requestPayloadHash(request);
    const existing = await this.getState(id);
    if (existing) {
      if (existing.payload_hash === payloadHash && existing.device_id === deviceId) {
        return { state: existing, created: false };
      }
      const isExplicitRetry = existing.device_id === deviceId &&
        existing.status === "failed" &&
        Number(request.attempt_count ?? 0) > Number(existing.attempt_count ?? 0);
      if (!isExplicitRetry) {
        const error = new Error("Request identity conflicts with an existing immutable payload");
        error.code = "CONFLICT";
        throw error;
      }
      const replacement = {
        ...existing,
        payload_hash: payloadHash,
        status: "queued",
        updated_at: this.now(),
        started_at: null,
        completed_at: null,
        acknowledged_at: null,
        error: null,
        attempt_count: request.attempt_count,
        recovered_after_restart: false
      };
      await atomicWriteJson(this.#requestPath(id), request);
      await atomicWriteJson(this.#statePath(id), replacement);
      await rm(this.#responsePath(id), { force: true });
      return { state: replacement, created: true };
    }

    const sequence = Math.max(this.now(), this.nextSequence);
    this.nextSequence = sequence + 1;
    const state = {
      protocol_version: HOST_PROTOCOL_VERSION,
      request_id: id,
      device_id: deviceId,
      payload_hash: payloadHash,
      status: "queued",
      sequence,
      received_at: this.now(),
      updated_at: this.now(),
      started_at: null,
      completed_at: null,
      acknowledged_at: null,
      error: null,
      attempt_count: request.attempt_count ?? 0
    };
    await mkdir(this.#jobDir(id), { recursive: true, mode: 0o700 });
    await atomicWriteJson(this.#requestPath(id), request);
    await atomicWriteJson(this.#statePath(id), state);
    return { state, created: true };
  }

  async getState(id) {
    return readJson(this.#statePath(id), null);
  }

  async getRequest(id) {
    return readJson(this.#requestPath(id), null);
  }

  async getResponse(id) {
    return readJson(this.#responsePath(id), null);
  }

  async updateState(id, patch) {
    const state = await this.getState(id);
    if (!state) throw new Error("Unknown checkpoint request");
    const updated = { ...state, ...patch, updated_at: this.now() };
    await atomicWriteJson(this.#statePath(id), updated);
    return updated;
  }

  async nextQueued() {
    const states = (await Promise.all((await this.#jobIds()).map(id => this.getState(id))))
      .filter(state => state?.status === "queued")
      .sort((left, right) => left.sequence - right.sequence || left.received_at - right.received_at);
    return states[0] ?? null;
  }

  async markRunning(id) {
    return this.updateState(id, { status: "generating", started_at: this.now(), error: null });
  }

  async markValidating(id) {
    return this.updateState(id, { status: "validating" });
  }

  async markReady(id, response) {
    await atomicWriteJson(this.#responsePath(id), response);
    return this.updateState(id, { status: "ready", completed_at: this.now(), error: null });
  }

  async markFailed(id, error) {
    return this.updateState(id, {
      status: "failed",
      completed_at: this.now(),
      error: String(error || "Continuity Host failed").slice(0, 500)
    });
  }

  async acknowledge(id, deviceId) {
    const state = await this.getState(id);
    if (!state || state.device_id !== deviceId) throw new Error("Unknown checkpoint request");
    if (state.status !== "ready" && state.status !== "acknowledged") throw new Error("Checkpoint result is not ready");
    await rm(this.#requestPath(id), { force: true });
    await rm(this.#responsePath(id), { force: true });
    return this.updateState(id, { status: "acknowledged", acknowledged_at: this.now(), error: null });
  }

  async supersede(id, replacementId, deviceId) {
    const state = await this.getState(id);
    if (!state || state.device_id !== deviceId) throw new Error("Unknown checkpoint request");
    return this.updateState(id, { status: "superseded", superseded_by: replacementId, completed_at: this.now() });
  }

  async queuePosition(id) {
    const target = await this.getState(id);
    if (!target || target.status !== "queued") return null;
    const queued = (await Promise.all((await this.#jobIds()).map(jobId => this.getState(jobId))))
      .filter(state => state?.status === "queued")
      .sort((left, right) => left.sequence - right.sequence || left.received_at - right.received_at);
    const index = queued.findIndex(state => state.request_id === id);
    return index < 0 ? null : index + 1;
  }

  async statusForDevice(id, deviceId) {
    const state = await this.getState(id);
    if (!state || state.device_id !== deviceId) return null;
    return {
      protocol_version: state.protocol_version,
      request_id: state.request_id,
      status: state.status,
      queue_position: await this.queuePosition(id),
      received_at: state.received_at,
      started_at: state.started_at,
      completed_at: state.completed_at,
      error: state.error,
      attempt_count: state.attempt_count
    };
  }

  async summary() {
    const states = (await Promise.all((await this.#jobIds()).map(id => this.getState(id)))).filter(Boolean);
    const active = states.find(state => ["generating", "validating"].includes(state.status)) ?? null;
    return {
      queue_depth: states.filter(state => state.status === "queued").length,
      active_request_id: active?.request_id ?? null,
      active_status: active?.status ?? null,
      active_started_at: active?.started_at ?? null
    };
  }

  async cleanup() {
    const now = this.now();
    for (const id of await this.#jobIds()) {
      const state = await this.getState(id);
      if (!state) continue;
      if (state.status === "acknowledged" && state.acknowledged_at && now - state.acknowledged_at > DIAGNOSTIC_RETENTION_MILLIS) {
        await rm(this.#jobDir(id), { recursive: true, force: true });
      } else if (state.status !== "acknowledged" && now - state.updated_at > UNACKNOWLEDGED_RETENTION_MILLIS) {
        await rm(this.#jobDir(id), { recursive: true, force: true });
      }
    }
  }
}

export async function pathExists(path) {
  try { await stat(path); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}
