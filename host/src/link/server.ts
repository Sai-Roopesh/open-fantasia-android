import { createReadStream, existsSync } from "node:fs";
import type { Server } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { basename, extname, join } from "node:path";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { Ajv2020 } from "ajv/dist/2020.js";
import linkSchema from "../../../protocol/schemas/link.schema.json" with { type: "json" };
import type { Engine } from "../engine/engine.js";
import type { Mac } from "../mac.js";
import type { ModelChoice } from "../story/state.js";
import { CONTRACT_VERSION } from "../protocol/generated/contract.js";
import type { ChooseRequest, EditRequest, RetryRequest, RetryWorldRequest, SetActorRequest, SetJobModelRequest, EndSceneRequest, ErrorBody, FocusRequest, LingerRequest, MoveRequest, PairRequest, RedoRequest, RemoveTasteRequest, RenamePathRequest, RewindRequest, TryAnotherWayRequest } from "../protocol/generated/link.js";
import { newTraceId, Traces } from "../trace.js";
import { backstageView } from "../views/backstage.js";
import { journalView } from "../views/journal.js";
import { pathsView } from "../views/paths.js";
import { pastScene, sceneView } from "../views/scene.js";
import { modelsView } from "../views/models.js";
import { listStories } from "../views/stories.js";
import type { Catalog } from "../models/catalog.js";
import { JOBS, setJobModel, setStoryActor, type Job } from "../models/jobs.js";
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
const validEndScene = ajv.compile<EndSceneRequest>({ $ref: "link#/$defs/EndSceneRequest" });
const validFocus = ajv.compile<FocusRequest>({ $ref: "link#/$defs/FocusRequest" });
const validLinger = ajv.compile<LingerRequest>({ $ref: "link#/$defs/LingerRequest" });
const validRedo = ajv.compile<RedoRequest>({ $ref: "link#/$defs/RedoRequest" });
const validChoose = ajv.compile<ChooseRequest>({ $ref: "link#/$defs/ChooseRequest" });
const validTry = ajv.compile<TryAnotherWayRequest>({ $ref: "link#/$defs/TryAnotherWayRequest" });
const validRewind = ajv.compile<RewindRequest>({ $ref: "link#/$defs/RewindRequest" });
const validRename = ajv.compile<RenamePathRequest>({ $ref: "link#/$defs/RenamePathRequest" });
const validEdit = ajv.compile<EditRequest>({ $ref: "link#/$defs/EditRequest" });
const validRemoveTaste = ajv.compile<RemoveTasteRequest>({ $ref: "link#/$defs/RemoveTasteRequest" });
const validSetJobModel = ajv.compile<SetJobModelRequest>({ $ref: "link#/$defs/SetJobModelRequest" });
const validSetActor = ajv.compile<SetActorRequest>({ $ref: "link#/$defs/SetActorRequest" });
const validRetry = ajv.compile<RetryRequest>({ $ref: "link#/$defs/RetryRequest" });
const validRetryWorld = ajv.compile<RetryWorldRequest>({ $ref: "link#/$defs/RetryWorldRequest" });

const IMAGE_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

export interface LinkOptions {
  mac: Mac;
  engine: Engine;
  pairing: Pairing;
  /** What each provider offers, for the Models screen and for checking a choice. */
  catalog: Catalog;
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
    // Both sides say which contract they speak, so a phone that is behind can say so instead of misreading.
    reply.header(CONTRACT_HEADER, String(CONTRACT_VERSION));
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

  // The Models screen (openspec outside-the-scene: One Models screen): settings of the Mac, not of a Story (docs/adr/0008).
  app.get("/models", async request => modelsView(mac, options.catalog, request.traceId));

  app.put<{ Params: { job: string } }>("/models/jobs/:job", async request => {
    const job = request.params.job;
    if (!(JOBS as readonly string[]).includes(job)) throw new LinkError("invalid", job === "actor" ? "There is no job \"actor\" for every Story; the Actor is set per Story." : `There is no job "${job}".`);
    if (!validSetJobModel(request.body)) throw new LinkError("invalid", "A job's model needs its provider and the model's id, and an effort or null.");
    setJobModel(mac.home, job as Job, offered(options.catalog, request.body.model));
    return modelsView(mac, options.catalog, request.traceId);
  });

  app.put<{ Params: { id: string } }>("/stories/:id/actor", async request => {
    if (!mac.tree.currentPath(request.params.id)) throw new LinkError("not_found", "There is no such Story on this Mac.");
    if (!validSetActor(request.body)) throw new LinkError("invalid", "A Story's Actor needs its provider and the model's id, and an effort or null; or null for its Story File's.");
    setStoryActor(mac.home, request.params.id, request.body.model ? offered(options.catalog, request.body.model) : null);
    return modelsView(mac, options.catalog, request.traceId);
  });

  app.get<{ Params: { id: string } }>("/stories/:id/scene", async request => sceneView(mac, engine, request.params.id, request.traceId));

  app.get<{ Params: { id: string; number: string } }>("/stories/:id/scenes/:number", async request => {
    const number = Number(request.params.number);
    if (!Number.isInteger(number) || number < 1) throw new LinkError("invalid", "A Scene is asked for by its number.");
    return pastScene(mac, request.params.id, number, request.traceId);
  });

  app.post<{ Params: { id: string } }>("/stories/:id/moves", async request => {
    if (!validMove(request.body)) throw new LinkError("invalid", "A Move needs its words and the entry it follows.");
    return engine.move(request.params.id, request.body.text, request.body.after, request.traceId);
  });

  app.post<{ Params: { id: string } }>("/stories/:id/choose", async request => {
    if (!validChoose(request.body)) throw new LinkError("invalid", "A choice needs its kind, the entry it follows, and the Gap or null.");
    return engine.choose(request.params.id, request.body, request.traceId);
  });

  // Paths (openspec paths): every change is refused mid-Reply, and one that moves the Story says so on the stream.
  app.get<{ Params: { id: string } }>("/stories/:id/paths", async request => pathsView(mac, request.params.id, request.traceId));

  app.post<{ Params: { id: string } }>("/stories/:id/paths", async request => {
    if (!validTry(request.body)) throw new LinkError("invalid", "Trying another way needs the Reply to start from, or null for the beginning, and the entry the phone last saw.");
    return engine.tryAnotherWay(request.params.id, request.body.from, request.body.after, request.traceId);
  });

  app.post<{ Params: { id: string } }>("/stories/:id/rewind", async request => {
    if (!validRewind(request.body)) throw new LinkError("invalid", "Rewind needs the Reply to go back to and the entry the phone last saw.");
    return engine.rewind(request.params.id, request.body.to, request.body.after, request.traceId);
  });

  // Outside the Scene (openspec outside-the-scene): the Journal, what he saw and heard; Backstage, everything else.
  app.get<{ Params: { id: string } }>("/stories/:id/journal", async request => journalView(mac, request.params.id, request.traceId));
  app.get<{ Params: { id: string } }>("/stories/:id/backstage", async request => backstageView(mac, request.params.id, request.traceId));
  app.post<{ Params: { id: string } }>("/stories/:id/taste/remove", async request => {
    if (!validRemoveTaste(request.body)) throw new LinkError("invalid", "Deleting a lesson needs the line and the entry the phone last saw.");
    return engine.removeTaste(request.params.id, request.body.line, request.body.after, request.traceId);
  });

  // Editing (openspec scenes: Editing): the latest Move or Reply in place, anything earlier on a new Path.
  app.post<{ Params: { id: string } }>("/stories/:id/edit", async request => {
    if (!validEdit(request.body)) throw new LinkError("invalid", "An edit needs the Move or Reply, the words it should read, and the entry the phone last saw.");
    return engine.edit(request.params.id, request.body.entry, request.body.text, request.body.after, request.traceId);
  });

  app.post<{ Params: { id: string } }>("/stories/:id/paths/clear", async request => engine.clearPaths(request.params.id, request.traceId));

  app.post<{ Params: { id: string; path: string } }>("/stories/:id/paths/:path/open", async request =>
    engine.openPath(request.params.id, request.params.path, request.traceId));

  app.post<{ Params: { id: string; path: string } }>("/stories/:id/paths/:path/rename", async request => {
    if (!validRename(request.body)) throw new LinkError("invalid", "Renaming a Path needs its new name.");
    return engine.renamePath(request.params.id, request.params.path, request.body.name, request.traceId);
  });

  app.delete<{ Params: { id: string; path: string } }>("/stories/:id/paths/:path", async request =>
    engine.deletePath(request.params.id, request.params.path, request.traceId));

  // Retry, or another model for this one try (openspec presence: Nothing fails silently). An empty body is a plain Retry.
  app.post<{ Params: { id: string } }>("/stories/:id/retry", async request => {
    const body = request.body ?? {};
    if (!validRetry(body)) throw new LinkError("invalid", "A Retry takes a model for this one try, or null.");
    return engine.retry(request.params.id, request.traceId, body.model ? offered(options.catalog, body.model) : null);
  });
  app.post<{ Params: { id: string } }>("/stories/:id/world/retry", async request => {
    const body = request.body ?? {};
    if (!validRetryWorld(body)) throw new LinkError("invalid", "A Retry takes a model for this one try, or null.");
    return engine.retryWorld(request.params.id, request.traceId, body.model ? offered(options.catalog, body.model) : null);
  });

  app.post<{ Params: { id: string } }>("/stories/:id/end-scene", async request => {
    if (!validEndScene(request.body)) throw new LinkError("invalid", "End scene needs the entry the phone last saw.");
    return engine.endScene(request.params.id, request.body.after, request.traceId);
  });

  app.post<{ Params: { id: string } }>("/stories/:id/focus", async request => {
    if (!validFocus(request.body)) throw new LinkError("invalid", "Focus needs who to focus on, or null, and the entry the phone last saw.");
    return engine.setFocus(request.params.id, request.body.after, request.body.on, request.traceId);
  });

  app.post<{ Params: { id: string } }>("/stories/:id/linger", async request => {
    if (!validLinger(request.body)) throw new LinkError("invalid", "Linger needs on or off, and the entry the phone last saw.");
    return engine.setLinger(request.params.id, request.body.after, request.body.on, request.traceId);
  });

  app.post<{ Params: { id: string } }>("/stories/:id/redo", async request => {
    if (!validRedo(request.body)) throw new LinkError("invalid", "Redo needs the entry the phone last saw, a Direction or null, and whether to remember it.");
    const model = request.body.model ? offered(options.catalog, request.body.model) : null;
    return engine.redo(request.params.id, request.body.after, request.body.direction, request.body.remember, request.traceId, model);
  });

  app.get<{ Params: { id: string; file: string } }>("/stories/:id/portraits/:file", async (request, reply) => {
    const file = join(mac.home, "portraits", basename(request.params.id), basename(request.params.file));
    if (!existsSync(file)) throw new LinkError("not_found", "That Portrait is not on this Mac.");
    return reply.type(IMAGE_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream").send(createReadStream(file));
  });

  app.get<{ Params: { id: string }; Querystring: { path?: string; head?: string } }>("/stories/:id/events", (request, reply) => {
    const storyId = request.params.id;
    const lastEventId = (request.headers["last-event-id"] as string | undefined) ?? null;
    // The Path and the head the phone is showing: when the Story has moved to another Path since, or that head was
    // edited away or rewound past, it is told that first.
    const seenPath = request.query.path ?? null;
    const seenHead = request.query.head ?? null;
    // Everything below runs before this function returns, so no event can be emitted between the catch-up and
    // the subscription: the store is read synchronously, and nothing else runs until we yield.
    const missed = engine.catchUp(storyId, lastEventId, seenPath, seenHead);
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", [TRACE_HEADER]: request.traceId, [CONTRACT_HEADER]: String(CONTRACT_VERSION) });
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

/** A choice from the phone as the Mac keeps it, once the provider is known to offer it. */
function offered(catalog: Catalog, choice: SetJobModelRequest["model"]): ModelChoice {
  const refusal = catalog.refusal(choice as ModelChoice);
  if (refusal) throw new LinkError("invalid", refusal);
  return choice.effort ? { provider: choice.provider, model: choice.model, effort: choice.effort } : { provider: choice.provider, model: choice.model };
}

