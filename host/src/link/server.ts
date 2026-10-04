import { createReadStream, existsSync } from "node:fs";
import type { Server } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { basename, extname, join } from "node:path";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { Ajv2020 } from "ajv/dist/2020.js";
import linkSchema from "../../../protocol/schemas/link.schema.json" with { type: "json" };
import type { Engine } from "../engine/engine.js";
import type { Mac } from "../mac.js";
import { CONTRACT_VERSION } from "../protocol/generated/contract.js";
import type { ErrorBody, MoveRequest, PairRequest } from "../protocol/generated/link.js";
import { newTraceId, Traces } from "../trace.js";
import { sceneView } from "../views/scene.js";
import { listStories } from "../views/stories.js";
import { LinkError, STATUS } from "./errors.js";
import type { Pairing } from "./pairing.js";

export const CONTRACT_HEADER = "fantasia-contract";
export const TRACE_HEADER = "fantasia-trace";

/** How often an open event stream is kept alive with a comment line, so idle networks do not drop it. */
const KEEPALIVE_MS = 15_000;

const ajv = new Ajv2020({ strict: false });
ajv.addSchema(linkSchema, "link");
const validMove = ajv.compile<MoveRequest>({ $ref: "link#/$defs/MoveRequest" });
const validPair = ajv.compile<PairRequest>({ $ref: "link#/$defs/PairRequest" });

const IMAGE_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

export interface LinkOptions {
  mac: Mac;
  engine: Engine;
  pairing: Pairing;
  hostId: string;
  hostName: string;
  https?: { key: string; cert: string };
}

declare module "fastify" {
  interface FastifyRequest {
    traceId: string;
  }
}

/**
 * The phone's way in (openspec mac-link): plain JSON commands over HTTPS, and one server-sent event stream per open
 * Story. Every request is checked for the contract version and a paired device, carries a trace id that is kept,
 * and ends in an answer or a refusal the player can read.
 */
export function buildLink(options: LinkOptions): FastifyInstance {
  const { mac, engine, pairing } = options;
  const traces = new Traces(mac.db);
  // The HTTPS server is made here and handed to Fastify, so the instance keeps one type with or without TLS; an
  // https.Server answers requests exactly as the http.Server Fastify's types expect.
  const tls = options.https;
  const app = Fastify({
    logger: false,
    // Event streams stay open for as long as a Story is; closing the server must not wait for them.
    forceCloseConnections: true,
    ...(tls ? { serverFactory: (handler: Parameters<typeof createHttpsServer>[1]) => createHttpsServer(tls, handler) as unknown as Server } : {})
  });

  app.decorateRequest("traceId", "");
  app.addHook("onRequest", async (request, reply) => {
    request.traceId = newTraceId();
    reply.header(TRACE_HEADER, request.traceId);
    const spoken = Number(request.headers[CONTRACT_HEADER]);
    if (spoken !== CONTRACT_VERSION) {
      throw new LinkError("version_mismatch", `This app speaks contract ${Number.isNaN(spoken) ? "none" : spoken} and your Mac speaks contract ${CONTRACT_VERSION}. Update the app to match your Mac.`);
    }
    if (request.url === "/pair") return;
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? null;
    if (!pairing.device(token)) throw new LinkError("unpaired", "This phone is not paired with this Mac. Run `fantasia pair` on the Mac and scan the code.");
  });
  app.addHook("preHandler", async request => {
    traces.begin(request.traceId, request.method, request.url, request.body);
  });
  app.addHook("onResponse", async (request, reply) => {
    traces.end(request.traceId, reply.statusCode, reply.statusCode < 400 ? "answered" : "refused");
  });
  app.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    const linkError = error instanceof LinkError ? error : new LinkError("internal", "Something went wrong on the Mac. Look the trace id up with `fantasia trace`.");
    const body: ErrorBody = { error: { code: linkError.code, message: linkError.message, trace_id: request.traceId } };
    traces.begin(request.traceId, request.method, request.url, request.body);
    traces.end(request.traceId, STATUS[linkError.code], `${linkError.code}: ${error instanceof Error ? error.message : String(error)}`);
    void reply.status(STATUS[linkError.code]).send(body);
  });

  app.post("/pair", async request => {
    if (!validPair(request.body)) throw new LinkError("invalid", "A pairing request needs the code from the QR code and the phone's name.");
    const token = pairing.pair(request.body.code, request.body.device_name);
    return { device_token: token, host_id: options.hostId, host_name: options.hostName, trace_id: request.traceId };
  });

  app.get("/stories", async request => ({ stories: listStories(mac), trace_id: request.traceId }));

  app.get<{ Params: { id: string } }>("/stories/:id/scene", async request => sceneView(mac, engine, request.params.id, request.traceId));

  app.post<{ Params: { id: string } }>("/stories/:id/moves", async request => {
    if (!validMove(request.body)) throw new LinkError("invalid", "A Move needs its words and the entry it follows.");
    return engine.move(request.params.id, request.body.text, request.body.after, request.traceId);
  });

  app.post<{ Params: { id: string } }>("/stories/:id/retry", async request => engine.retry(request.params.id, request.traceId));

  app.get<{ Params: { id: string; file: string } }>("/stories/:id/portraits/:file", async (request, reply) => {
    const file = join(mac.home, "portraits", basename(request.params.id), basename(request.params.file));
    if (!existsSync(file)) throw new LinkError("not_found", "That Portrait is not on this Mac.");
    return reply.type(IMAGE_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream").send(createReadStream(file));
  });

  app.get<{ Params: { id: string } }>("/stories/:id/events", (request, reply) => {
    const storyId = request.params.id;
    const lastEventId = (request.headers["last-event-id"] as string | undefined) ?? null;
    // Everything below runs before this function returns, so no event can be emitted between the catch-up and
    // the subscription: the store is read synchronously, and nothing else runs until we yield.
    const missed = engine.catchUp(storyId, lastEventId);
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", [TRACE_HEADER]: request.traceId });
    const send = (id: string, data: unknown) => raw.write(`id: ${id}\ndata: ${JSON.stringify(data)}\n\n`);
    for (const event of missed) send(event.id, event.event);
    const unsubscribe = engine.subscribe(storyId, event => send(event.id, event.event));
    const keepalive = setInterval(() => raw.write(": keepalive\n\n"), KEEPALIVE_MS);
    request.raw.on("close", () => {
      clearInterval(keepalive);
      unsubscribe();
    });
  });

  return app;
}
