import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join, resolve } from "node:path";
import { nameIndex, storyName } from "../agents/names.js";
import qrcode from "qrcode-terminal";
import { localAddresses } from "../link/bonjour.js";
import { Pairing, PAIRING_MINUTES } from "../link/pairing.js";
import { ensureCertificate } from "../link/tls.js";
import type { Engine } from "../engine/engine.js";
import { LinkError } from "../link/errors.js";
import type { Mac } from "../mac.js";
import { pathsView } from "../views/paths.js";
import { randomUUID } from "node:crypto";
import { Catalog } from "../models/catalog.js";
import { actorOf, DEFAULT_JOB_MODELS, editsEveryReply, JOBS, jobModels, setEditsEveryReply, setJobModel, setStoryActor, storyActor, type Job } from "../models/jobs.js";
import { CLAUDE_TOKEN, readSecret, storeSecret } from "../secrets.js";
import { antigravityToken, codexCredentials } from "../models/direct.js";
import type { ModelChoice } from "../story/state.js";
import type { Payload } from "../story/entries.js";
import { parseStoryTime, sayStoryTime } from "../time.js";
import { importStoryFile } from "../storyfile/import.js";
import { besideOf, tasteOf } from "../store/beside.js";
import { composerCall, parseComposedAnswer } from "../agents/composer.js";
import { tokens } from "../context/lens.js";
import { subscriptionRunners } from "../models/runners.js";
import { Models } from "../models/model-call.js";
import { editorPrompt } from "../agents/editor.js";
import { Drafts } from "../store/drafts.js";
import { Traces } from "../trace.js";
import { say, sceneEntries } from "../views/scene.js";
import { listStories } from "../views/stories.js";
import { identity } from "./identity.js";

/** Everything a command prints, so tests can read it and the terminal can show it. */
export type Out = (line: string) => void;

/**
 * Shows a pairing QR code, or with [adb], the adb command that hands a debug build the same invite without a camera.
 */
export async function pair(mac: Mac, out: Out, options: { adb?: boolean } = {}): Promise<void> {
  const me = identity(mac.home);
  const certificate = await ensureCertificate(mac.home);
  const invite = new Pairing(mac.db).invite({ hostId: me.hostId, hostName: me.hostName, addresses: localAddresses(), port: me.port, fingerprint: certificate.fingerprint });
  const text = JSON.stringify(invite);
  if (options.adb) {
    out(`adb shell am start -n com.openfantasia/com.openfantasia.app.MainActivity --es invite_b64 ${Buffer.from(text).toString("base64")}`);
    return;
  }
  await new Promise<void>(done => qrcode.generate(text, { small: true }, (code: string) => {
    out(code);
    done();
  }));
  out(`Scan this with Open Fantasia on your phone within ${PAIRING_MINUTES} minutes. It works once.`);
}

export function importCommand(mac: Mac, folder: string, out: Out): boolean {
  const result = importStoryFile(resolve(folder), mac);
  if (result.ok) {
    out(`Imported "${listStories(mac).find(story => story.id === result.storyId)?.title}" as ${result.storyId}.`);
    return true;
  }
  out(`Nothing was imported. ${result.problems.length === 1 ? "One problem" : `${result.problems.length} problems`}:`);
  for (const problem of result.problems) out(`  ${problem.where}: ${problem.message}`);
  return false;
}

export function stories(mac: Mac, out: Out): void {
  const all = listStories(mac);
  if (all.length === 0) out("No Stories yet. Import one with `fantasia import <folder>`.");
  for (const story of all) out(`${story.id}  ${story.title}  (${story.standing})`);
}

export function show(mac: Mac, storyId: string, entryId: string | undefined, out: Out): boolean {
  if (entryId) {
    const entry = mac.tree.entry(entryId);
    if (!entry || entry.storyId !== storyId) return (out(`No entry ${entryId} in that Story.`), false);
    out(JSON.stringify(entry, null, 2));
    return true;
  }
  const path = mac.tree.currentPath(storyId);
  if (!path) return (out(`No Story ${storyId}.`), false);
  out(`Path "${path.name}", head ${path.headEntryId}`);
  for (const entry of mac.tree.pathTo(path.headEntryId)) {
    out(`${String(entry.seq).padStart(5)}  ${entry.id}  ${entry.payload.kind.padEnd(13)}  ${describe(entry.payload).replace(/\s+/g, " ").slice(0, 90)}`);
  }
  return true;
}

/** One line for an entry, as `fantasia show` lists a Path. */
function describe(payload: Payload): string {
  switch (payload.kind) {
    case "story_set_up": return payload.storyFile.title;
    case "scene_opened": return `Scene ${payload.number}: ${payload.title}, ${payload.place}, ${payload.at}`;
    case "move":
    case "reply": return payload.text;
    case "redo": return payload.direction ? `Redo: ${payload.direction}${payload.remember ? " (remember)" : ""}` : "Redo";
    case "beat_note": return `[${payload.call}, ${payload.intensity}${payload.arcMoved ? ", an Arc moved" : ""}] ${payload.clock} ${payload.note}`;
    case "scene_closed": return `closed by the ${payload.by}`;
    case "focus_set": return payload.on ? `Focus on ${payload.on}` : "Focus cleared";
    case "linger_set": return payload.on ? "Linger on" : "Linger off";
    case "known_set": return `Known of ${payload.person}: ${payload.text}`;
    case "person_set": return `${payload.person.name}: ${payload.person.whoTheyAre}`;
    case "lead_set": return `${payload.person} ${payload.lead ? "is" : "is no longer"} a Lead`;
    case "group_set": return `The Group ${payload.group}: ${payload.description}`;
    case "portrait_set": return `${payload.person}'s Portrait is ${payload.file}`;
    case "premise_set": return `Premise: ${payload.premise}`;
    case "style_set": return `Style: ${payload.style}`;
    case "reply_length_set": return `Reply length: ${payload.length}`;
    case "arcs_set": return `Arcs: ${payload.arcs.join(" / ") || "none"}`;
    case "landmark_set": return `The Landmark ${payload.landmark.name}, ${payload.landmark.at}: ${payload.landmark.what}`;
    case "landmark_dropped": return `The Landmark ${payload.name} dropped`;
    case "place_set": return `The ${payload.institution ? "institution" : "place"} ${payload.place.name}: ${payload.place.description}`;
    case "world_set": return `The World: ${payload.summary}`;
    case "clock_set": return `The clock moved on to ${payload.clock}${payload.dayOne ? `, Day 1 on ${payload.dayOne}` : ""}`;
    case "routine_set": return `Routine: ${payload.routine.join(" / ")}`;
    case "chronicle": return `Scene ${payload.scene} recorded, ${payload.moments.length} Moments: ${payload.summary}`;
    case "world_moved": return `The World moved on${payload.gap ? " over a Gap" : ""} to ${payload.until}: ${payload.lives.length} Lives, ${payload.happened.length} happened, ${payload.meanwhile.length} in Meanwhile`;
    case "outline_set": return `The Outline: Act ${payload.outline.current} of ${payload.outline.acts.length}, ${payload.reason}`;
    case "director_plan": return `The Director: ${payload.phase} toward ${payload.toward}, ${payload.scenes.length} Scenes, new: ${payload.newThings.map(thing => thing.what).join(" / ")}`;
    case "story_folded": return `${payload.count} folded into ${payload.into === "act" ? "an Act's account" : "a week"}: ${payload.text}`;
    // An old Path's Taste, brief or reaction, from before they were kept beside the Story (docs/adr/0020).
    default: return `${(payload as { kind: string }).kind}, now kept beside the Story`;
  }
}

const PROVIDERS: readonly ModelChoice["provider"][] = ["claude", "codex", "antigravity"];

/** The catalog as the Mac last kept it: the command reads what `fantasia serve` was told, and asks no provider itself. */
function keptCatalog(home: string): Catalog {
  const unasked = () => Promise.reject(new Error("Not asked from the command line"));
  return new Catalog(home, { claude: unasked, codex: unasked, antigravity: unasked });
}

const sayChoice = (choice: ModelChoice) => `${choice.provider} ${choice.model}${choice.effort ? ` (effort ${choice.effort})` : ""}`;

/**
 * `fantasia models` (models-screen design decision 8): with no arguments, every job's model, each Story's Actor and
 * what each provider last offered; with a job, a provider, a model and an optional effort, sets that job's model from
 * its next call; with `actor "<Story>"`, sets that Story's own Actor, or `reset` puts back its Story File's.
 */
export function models(mac: Mac, args: string[], out: Out): boolean {
  const catalog = keptCatalog(mac.home);
  const [job, ...rest] = args;
  if (!job) {
    const current = jobModels(mac.home);
    for (const name of JOBS) {
      const choice = current[name];
      const isDefault = JSON.stringify(choice) === JSON.stringify(DEFAULT_JOB_MODELS[name]);
      out(`${name}  ${choice.provider}  ${choice.model}${choice.effort ? `  effort ${choice.effort}` : ""}${isDefault ? "  (default)" : ""}`);
    }
    const stories = mac.db.prepare("SELECT id, title FROM stories WHERE before_ledger = 0 ORDER BY created_at").all() as { id: string; title: string }[];
    for (const story of stories) {
      const actor = actorOf(mac, story.id);
      if (!actor) continue;
      out(`actor  "${story.title}" (${story.id})  ${actor.provider}  ${actor.model}${actor.effort ? `  effort ${actor.effort}` : ""}${storyActor(mac.home, story.id) ? "" : "  (its Story File's)"}`);
    }
    for (const offer of catalog.view()) {
      out(offer.models.length === 0 ? `${offer.provider} offers  nothing known yet; \`fantasia serve\` asks it`
        : `${offer.provider} offers  ${offer.models.map(model => model.efforts.length ? `${model.id} (${model.efforts.join(" ")})` : model.id).join(", ")}`);
    }
    return true;
  }
  if (job === "actor") {
    const [story, ...setting] = rest;
    const found = (mac.db.prepare("SELECT id, title FROM stories WHERE before_ledger = 0 AND (id = ? OR title = ?)").get(story ?? "", story ?? "") as { id: string; title: string } | undefined);
    if (!found) return (out(`No Story "${story ?? ""}" on this Mac.`), false);
    if (setting[0] === "reset") {
      setStoryActor(mac.home, found.id, null);
      const fileActor = actorOf(mac, found.id);
      out(`The Actor of "${found.title}" is its Story File's again${fileActor ? `: ${sayChoice(fileActor)}` : ""}.`);
      return true;
    }
    const choice = chosen(catalog, setting, out);
    if (!choice) return false;
    setStoryActor(mac.home, found.id, choice);
    out(`The Actor of "${found.title}" now uses ${sayChoice(choice)}, from its next Reply.`);
    return true;
  }
  if (!JOBS.some(name => name === job)) return (out(`No job "${job}". The jobs are: ${JOBS.join(", ")}, or actor "<Story>".`), false);
  const choice = chosen(catalog, rest, out);
  if (!choice) return false;
  setJobModel(mac.home, job as Job, choice);
  out(`The ${job.charAt(0).toUpperCase()}${job.slice(1)} now uses ${sayChoice(choice)}, from its next call.`);
  return true;
}

/** A provider, a model and an optional effort from the command line, when the provider offers them. */
function chosen(catalog: Catalog, [provider, model, effort]: string[], out: Out): ModelChoice | null {
  if (!provider || !PROVIDERS.includes(provider as ModelChoice["provider"])) return (out(`No provider "${provider ?? ""}". The providers are: ${PROVIDERS.join(", ")}.`), null);
  if (!model) return (out("Name the model, as its provider lists it: fantasia models writer claude claude-sonnet-5-5"), null);
  const choice: ModelChoice = effort ? { provider: provider as ModelChoice["provider"], model, effort } : { provider: provider as ModelChoice["provider"], model };
  const refusal = catalog.refusal(choice);
  return refusal ? (out(refusal), null) : catalog.complete(choice);
}

/**
 * `fantasia moments`: the Moments a Story's current Path remembers, each with its Scene, weight, what it was, who was
 * there and who was told, and its words, until Backstage shows them on the phone.
 */
export function moments(mac: Mac, storyId: string, out: Out): boolean {
  const path = mac.tree.currentPath(storyId);
  if (!path) return (out(`No Story ${storyId}.`), false);
  const state = mac.states.at(path.headEntryId);
  const pc = state.playerCharacter;
  const titles = new Map(state.recorded.map(row => [row.number, row.title]));
  const remembered = state.facts.filter(fact => fact.source === "page");
  if (remembered.length === 0) out("No Moments recorded yet.");
  for (const fact of remembered) {
    out(`Scene ${fact.scene}${titles.has(fact.scene) ? ` · ${titles.get(fact.scene)}` : ""} · weight ${fact.weight}`);
    out(`  ${fact.what}`);
    out(`  Known to: ${fact.knownTo.join(", ")}`);
    for (const quote of fact.quotes) {
      const entry = mac.tree.entry(quote.entry);
      out(`  ${entry?.payload.kind === "move" ? `${pc}: ` : ""}"${quote.text}"`);
    }
  }
  return true;
}

/** `fantasia record`: The record of a Story's current Path, as Backstage shows it: each Scene with parts left out, and why. */
export function record(mac: Mac, storyId: string, out: Out): boolean {
  const path = mac.tree.currentPath(storyId);
  if (!path) return (out(`No Story ${storyId}.`), false);
  const rows = mac.states.at(path.headEntryId).recorded.filter(row => row.dropped.length);
  if (rows.length === 0) out("Nothing was left out of the record.");
  for (const row of rows) {
    out(`Scene ${row.number} · ${row.title}`);
    for (const why of row.dropped) out(`  left out: ${why}`);
  }
  return true;
}

/**
 * `fantasia prompts`: the actual combined writing request for [move] and the independent Editor request for the latest
 * saved draft, calling no model: for checking what each stage knows.
 */
export function prompts(mac: Mac, storyId: string, move: string, out: Out): boolean {
  const path = mac.tree.currentPath(storyId);
  if (!path) return (out(`No Story ${storyId}.`), false);
  const head = path.headEntryId;
  const beside = besideOf(mac, storyId, head);
  const { state, entries } = sceneEntries(mac, head);
  const writing = composerCall({ state, scene: entries, move, choice: null, beside, path: mac.tree.pathTo(head) });
  for (const line of [`== Writing, for the Move: ${move}`, `-- system\n${writing.system}`, `-- prompt\n${writing.prompt}`]) out(line);
  const note = entries.findLast(entry => entry.payload.kind === "beat_note");
  if (!note || note.payload.kind !== "beat_note" || state.scene?.closed) return (out("== The Editor runs after a draft is written."), true);
  const draft = new Drafts(mac.db).get(note.id);
  if (!draft) return (out("== No saved draft is available for an Editor preview."), true);
  const answered = sceneEntries(mac, note.id);
  const latest = answered.entries.findLast(entry => entry.payload.kind === "move");
  const editor = editorPrompt({ state: answered.state, beside: draft.beside, scene: answered.entries, reply: draft.text, present: answered.state.scene?.here ?? [] });
  for (const line of [`== The Editor, for the latest saved draft: ${latest?.payload.kind === "move" ? latest.payload.text : ""}`, `-- system\n${editor.system}`, `-- prompt\n${editor.prompt}`]) out(line);
  return true;
}

/**
 * `fantasia bench`: reports exact Storyteller prompt token breakdown, cacheable prefix share, Path-isolated Direction
 * count, Outline/Chronicler status, and with `--run` executes one non-mutating live generation so prose & usage can be
 * judged directly before playing.
 */
export async function bench(
  mac: Mac,
  storyId: string,
  move: string,
  out: Out,
  options: { run?: boolean; model?: string } = {}
): Promise<boolean> {
  const path = mac.tree.currentPath(storyId);
  if (!path) return (out(`No Story ${storyId}.`), false);
  const head = path.headEntryId;
  const beside = besideOf(mac, storyId, head);
  const allNotes = besideOf(mac, storyId).notes.filter(note => note.active !== false);
  const activeNotes = beside.notes.filter(note => note.active !== false);
  const { state, entries } = sceneEntries(mac, head);
  const writing = composerCall({ state, scene: entries, move, choice: null, beside, path: mac.tree.pathTo(head) });
  const sysTok = tokens(writing.system);
  const turnTokens = writing.conversation.map(turn => tokens(turn.text));
  const standingTok = turnTokens[0] ?? 0;
  const historyTok = turnTokens.slice(1, -1).reduce((sum, count) => sum + count, 0);
  const deltaTok = turnTokens.length > 1 ? (turnTokens.at(-1) ?? 0) : standingTok;
  const totalTok = sysTok + turnTokens.reduce((sum, count) => sum + count, 0);
  const cacheableTok = totalTok - deltaTok;
  const cachePct = totalTok > 0 ? Math.round((cacheableTok / totalTok) * 100) : 0;
  const exchanges = entries.filter(entry => entry.payload.kind === "move").length;

  out(`Story: ${state.title} (${storyId})`);
  out(`Path: ${path.id} (${path.origin}) · Scene ${state.scene?.number ?? 0} · ${exchanges} exchanges`);
  out(`Outline: ${state.outline ? `v${state.outline.version} (Act ${state.outline.current})` : "none"} · Mid-scene recorded: ${state.scene?.recorded ? "yes" : "no"}`);
  out(`Directions on this Path: ${activeNotes.length} active (${allNotes.length - activeNotes.length} isolated on other Paths)`);
  out(`Prompt tokens (~est): total=${totalTok} · system=${sysTok} · standing=${standingTok} · history=${historyTok} (${Math.max(0, writing.conversation.length - 2)} turns) · uncached_delta=${deltaTok} · cacheable=${cachePct}%`);
  if (!options.run) return true;

  let choice = actorOf(mac, storyId);
  if (options.model) {
    const [providerPart, rest = ""] = options.model.split("/");
    const [modelPart, effortPart] = rest.split(":");
    if ((providerPart === "codex" || providerPart === "claude" || providerPart === "antigravity") && modelPart) {
      choice = { provider: providerPart, model: modelPart, ...(effortPart ? { effort: effortPart } : {}) };
    } else {
      out("Model format: provider/model[:effort], e.g. codex/gpt-6.1-sol:medium");
      return false;
    }
  }
  if (!choice) return (out("No Actor model configured for this Story."), false);
  const runners = subscriptionRunners(mac.home);
  const models = new Models(mac.db, runners);
  const started = Date.now();
  try {
    const answer = await models.call({
      agent: "actor", model: choice, system: writing.system, prompt: writing.prompt, conversation: writing.conversation,
      verbosity: writing.verbosity, tools: writing.tools, turns: 4, traceId: `bench-${randomUUID().slice(0, 8)}`, storyId
    });
    const parsed = parseComposedAnswer(answer.text);
    const words = parsed.reply.split(/\s+/).filter(Boolean).length;
    const row = mac.db.prepare("SELECT usage FROM calls WHERE id = ?").get(answer.callId) as { usage: string | null } | undefined;
    out(`Model: ${choice.provider}/${choice.model}${choice.effort ? ` (${choice.effort})` : ""} · ${((Date.now() - started) / 1000).toFixed(1)}s · ${words} words`);
    if (row?.usage) out(`Usage: ${row.usage}`);
    if (parsed.meta) out(`Scene state: ${JSON.stringify(parsed.meta)}`);
    out("--- REPLY ---");
    out(parsed.reply);
    return true;
  } finally {
    runners.close();
  }
}

/** `fantasia world`: the World off-screen on a Story's current Path, hidden things included, until Backstage arrives. */
export function world(mac: Mac, storyId: string, out: Out): boolean {
  const path = mac.tree.currentPath(storyId);
  if (!path) return (out(`No Story ${storyId}.`), false);
  const state = mac.states.at(path.headEntryId);
  const when = (at: string) => {
    const time = parseStoryTime(at);
    return time ? `${at} (${sayStoryTime(time, state.dayOne)})` : at;
  };
  out(`It is ${when(state.clock)}.`);
  out("Lives:");
  for (const [who, life] of Object.entries(state.lives)) out(`  ${who}: ${life.where ?? "where not yet said"}; ${life.doing ?? "doing not yet said"}; after: ${life.after || "nothing said"}`);
  out("Threads:");
  if (state.threads.length === 0) out("  none");
  for (const thread of state.threads) out(`  ${thread.name}: ${thread.now}`);
  out("What happened:");
  const happened = state.facts.filter(fact => fact.source === "world");
  if (happened.length === 0) out("  nothing yet");
  for (const item of happened) out(`  ${item.at} · ${item.where ?? ""} · ${item.what} · known to: ${item.knownTo.join(", ") || "nobody"}${item.landmark ? ` · the Landmark ${item.landmark}` : ""}`);
  return true;
}

export function trace(mac: Mac, traceId: string, out: Out): boolean {
  const described = new Traces(mac.db).describe(traceId);
  out(described ?? `No trace ${traceId} on this Mac.`);
  return described !== null;
}

/** Stores the Claude subscription token, from the first Open Fantasia's keychain or from what is pasted. */
export function claudeToken(fromFirstHost: boolean, pasted: string | null, out: Out): boolean {
  const token = fromFirstHost
    ? execFileSync("/usr/bin/security", ["find-generic-password", "-s", "com.openfantasia.continuity-host", "-a", "claude-oauth-token", "-w"], { encoding: "utf8" }).trim()
    : pasted?.trim();
  if (!token) return (out("No token given. Run `claude setup-token`, then paste its token into `fantasia claude-token`."), false);
  storeSecret(CLAUDE_TOKEN, "Open Fantasia Claude token", token);
  out("Stored the Claude token in the keychain.");
  return true;
}

const LAUNCH_AGENT = "com.openfantasia.host";

/** Installs `fantasia serve` as a LaunchAgent: started at login and restarted if it stops. */
export function install(mac: Mac, out: Out): void {
  const plist = join(homedir(), "Library", "LaunchAgents", `${LAUNCH_AGENT}.plist`);
  const logs = join(mac.home, "logs");
  mkdirSync(logs, { recursive: true });
  const bin = resolve(import.meta.dirname, "..", "..", "bin", "fantasia.mjs");
  writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LAUNCH_AGENT}</string>
  <key>ProgramArguments</key><array><string>${process.execPath}</string><string>${bin}</string><string>serve</string></array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${process.env.PATH ?? "/usr/bin:/bin"}</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${join(logs, "serve.log")}</string>
  <key>StandardErrorPath</key><string>${join(logs, "serve.log")}</string>
</dict>
</plist>
`);
  const domain = `gui/${process.getuid?.() ?? 501}`;
  try {
    execFileSync("/bin/launchctl", ["bootout", `${domain}/${LAUNCH_AGENT}`], { stdio: "ignore" });
  } catch {
    // Not loaded yet; nothing to stop.
  }
  execFileSync("/bin/launchctl", ["bootstrap", domain, plist]);
  out(`Installed and started ${LAUNCH_AGENT}. Logs: ${join(logs, "serve.log")}`);
}

/** What is right and wrong with this Mac's setup, one line each. */
export function doctor(mac: Mac, out: Out): boolean {
  const checks: [string, boolean, string][] = [];
  const stories = (mac.db.prepare("SELECT COUNT(*) AS n FROM stories WHERE before_ledger = 0").get() as { n: number }).n;
  checks.push(["Story store", true, `${join(mac.home, "fantasia.db")}, ${stories} ${stories === 1 ? "Story" : "Stories"}`]);
  const token = readSecret(CLAUDE_TOKEN);
  checks.push(["Claude token", token !== null, token ? "stored" : "missing: run `fantasia claude-token`"]);
  // Not failures: a sign-in the direct path cannot use sends its calls through the provider's own tool (docs/adr/0023).
  for (const [name, read, tool] of [["Codex", () => codexCredentials(), "codex app-server"], ["Antigravity", () => antigravityToken(), "agy"]] as const) {
    try {
      read();
      checks.push([`${name} direct`, true, "signed in: calls go straight to the model"]);
    } catch (error) {
      checks.push([`${name} direct`, true, `${error instanceof Error ? error.message : String(error)}; calls go through ${tool}, which renews it`]);
    }
  }
  const plist = join(homedir(), "Library", "LaunchAgents", `${LAUNCH_AGENT}.plist`);
  let running = false;
  try {
    running = execFileSync("/bin/launchctl", ["print", `gui/${process.getuid?.() ?? 501}/${LAUNCH_AGENT}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).includes("state = running");
  } catch {
    running = false;
  }
  checks.push(["Serving", running, existsSync(plist) ? (running ? "the LaunchAgent is running" : "the LaunchAgent is installed but not running") : "not installed: run `fantasia install`"]);
  for (const [name, ok, detail] of checks) out(`${ok ? "ok " : "!! "} ${name}: ${detail}`);
  return checks.every(([, ok]) => ok);
}

/**
 * Edits a Move or a Reply as the player can (openspec stories: Claude can edit a Story as the player can): the latest
 * in place, anything earlier on a new Path, where an edited Move waits here for its Reply. A phone watching the Story
 * is told by the serving Mac, which notices the change.
 */
export async function edit(mac: Mac, engine: Engine, storyId: string, entryId: string, text: string, out: Out): Promise<boolean> {
  const path = mac.tree.currentPath(storyId);
  if (!path) {
    out(`No Story ${storyId} on this Mac.`);
    return false;
  }
  try {
    const accepted = engine.edit(storyId, entryId, text, path.headEntryId, `edit-${randomUUID().slice(0, 8)}`);
    const now = mac.tree.currentPath(storyId);
    if (now?.id === path.id) out("Edited in place.");
    else out(`Edited on a new Path: ${pathsView(mac, storyId, "edit").rows.find(row => row.path?.current)?.path?.label ?? "a new Path"}.`);
    if (mac.tree.entry(accepted.head_entry_id)?.payload.kind === "move") {
      await engine.settled(storyId);
      const turn = engine.turnState(storyId);
      const reply = mac.tree.pathTo(mac.tree.currentPath(storyId)?.headEntryId ?? accepted.head_entry_id).filter(entry => entry.payload.kind === "reply").at(-1);
      if (turn.kind === "failed") out(`The Reply could not be written: ${turn.reason ?? ""}`);
      else if (reply?.payload.kind === "reply") out(reply.payload.text);
    }
    return true;
  } catch (error) {
    if (!(error instanceof LinkError)) throw error;
    out(error.message);
    return false;
  }
}

/**
 * `fantasia known`: what the Player Character knows of someone, set on a Story already being played (the-world-screen
 * design decision 8), between Replies. The World screen shows it from then on.
 */
export function known(mac: Mac, engine: Engine, storyId: string, person: string, text: string, out: Out): boolean {
  const path = mac.tree.currentPath(storyId);
  if (!path) return (out(`No Story ${storyId} on this Mac.`), false);
  try {
    const accepted = engine.setKnown(storyId, person, text, path.headEntryId, `known-${randomUUID().slice(0, 8)}`);
    const entry = mac.tree.entry(accepted.head_entry_id)?.payload;
    const state = mac.states.at(accepted.head_entry_id);
    if (entry?.kind === "known_set") out(`What ${state.playerCharacter} knows of ${entry.person} is now: ${entry.text}`);
    return true;
  } catch (error) {
    if (!(error instanceof LinkError)) throw error;
    out(error.message);
    return false;
  }
}

/** What `fantasia person` may set; anything left out is kept as it is. */
export interface PersonOptions {
  who?: string;
  known?: string;
  appearance?: string;
  after?: string;
  alias?: string[];
  voice?: string[];
  group?: string;
  portrait?: string;
}

/** Runs an edit on the Story's current Path from its head, saying the refusal's reason when there is one. */
function onPath(mac: Mac, storyId: string, out: Out, edit: (head: string) => void): boolean {
  const path = mac.tree.currentPath(storyId);
  if (!path) return (out(`No Story ${storyId} on this Mac.`), false);
  try {
    edit(path.headEntryId);
    return true;
  } catch (error) {
    if (!(error instanceof LinkError)) throw error;
    out(error.message);
    return false;
  }
}

const IMAGE_TYPES_BY_EXTENSION: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

/**
 * `fantasia person`: adds someone to the Story, or changes only what is given, from here on the current Path
 * (editing-people design decision 6), with their Portrait when `--portrait` names an image on the Mac.
 */
export async function person(mac: Mac, engine: Engine, storyId: string, name: string, options: PersonOptions, out: Out): Promise<boolean> {
  const path = mac.tree.currentPath(storyId);
  if (!path) return (out(`No Story ${storyId} on this Mac.`), false);
  const state = mac.states.at(path.headEntryId);
  const found = storyName(nameIndex(Object.values(state.people)), name);
  const existing = found ? state.people[found] : undefined;
  if (!existing && !options.who) return (out(`Say who ${name.trim()} is with --who: they are not in the Story yet.`), false);
  const base = existing ?? { name: name.trim(), aliases: [], whoTheyAre: "", known: null, appearance: "", after: "", knows: [], voice: [], group: null };
  const edited = {
    name: base.name, aliases: options.alias ?? base.aliases, whoTheyAre: options.who ?? base.whoTheyAre,
    known: options.known ?? (existing ? mac.states.at(path.headEntryId).known[base.name]?.text ?? null : null),
    appearance: options.appearance ?? base.appearance, after: options.after ?? base.after, knows: base.knows,
    voice: options.voice ?? base.voice, group: options.group === undefined ? base.group : options.group || null
  };
  const changed = onPath(mac, storyId, out, head => { engine.setPerson(storyId, edited, head, `person-${randomUUID().slice(0, 8)}`, !existing); });
  if (!changed) return false;
  out(existing ? `${base.name} is changed, from here on this Path.` : `${base.name} is in the Story now, from here on this Path.`);
  return options.portrait ? portrait(mac, engine, storyId, base.name, options.portrait, out) : true;
}

/** Someone's name as the Story has it now on the current Path, however [name] was typed. */
function nameNow(mac: Mac, storyId: string, name: string): string {
  const path = mac.tree.currentPath(storyId);
  return (path && storyName(nameIndex(Object.values(mac.states.at(path.headEntryId).people)), name)) ?? name;
}

/** `fantasia portrait`: replaces someone's Portrait with an image on the Mac, from here on the current Path. */
export function portrait(mac: Mac, engine: Engine, storyId: string, name: string, file: string, out: Out): boolean {
  if (!existsSync(file)) return (out(`There is no file ${file}.`), false);
  const type = IMAGE_TYPES_BY_EXTENSION[extname(file).toLowerCase()] ?? "application/octet-stream";
  const ok = onPath(mac, storyId, out, head => { engine.setPortrait(storyId, name, readFileSync(file), type, head, `portrait-${randomUUID().slice(0, 8)}`); });
  if (ok) out(`${nameNow(mac, storyId, name)}'s Portrait is set.`);
  return ok;
}

/** `fantasia lead`: makes someone a Lead, or stops them being one. */
export function lead(mac: Mac, engine: Engine, storyId: string, name: string, onOff: string, out: Out): boolean {
  if (onOff !== "on" && onOff !== "off") return (out("Say on or off."), false);
  const ok = onPath(mac, storyId, out, head => { engine.setLead(storyId, name, onOff === "on", head, `lead-${randomUUID().slice(0, 8)}`); });
  if (ok) {
    const full = nameNow(mac, storyId, name);
    out(onOff === "on" ? `${full} is a Lead now.` : `${full} is not a Lead now.`);
  }
  return ok;
}

/** `fantasia editor`: whether a model Editor reads every Reply before the player does (docs/adr/0024); off unless on. */
export function editor(mac: Mac, onOff: string | undefined, out: Out): boolean {
  if (onOff === undefined) return (out(editsEveryReply(mac.home) ? "Every Reply is edited before you read it." : "Replies come straight to you; Redo is yours."), true);
  if (onOff !== "on" && onOff !== "off") return (out("Say on or off."), false);
  setEditsEveryReply(mac.home, onOff === "on");
  out(onOff === "on" ? "Every Reply is edited before you read it." : "Replies come straight to you; Redo is yours.");
  return true;
}

/** `fantasia group`: creates a Group, or changes its description. */
export function group(mac: Mac, engine: Engine, storyId: string, name: string, description: string, out: Out): boolean {
  const ok = onPath(mac, storyId, out, head => { engine.setGroup(storyId, name, description, head, `group-${randomUUID().slice(0, 8)}`); });
  if (ok) out(`The Group ${name.trim()} is set.`);
  return ok;
}


// The rest of the Story through the Mac's commands (editing-the-story design decision 5): each writes on the current
// Path through the engine, as the phone does, and says what changed or why not.

const traceFor = (command: string) => `${command}-${randomUUID().slice(0, 8)}`;

/** `fantasia premise`: replaces the Premise. */
export function premise(mac: Mac, engine: Engine, storyId: string, words: string, out: Out): boolean {
  const ok = onPath(mac, storyId, out, head => { engine.setPremise(storyId, words, head, traceFor("premise")); });
  if (ok) out("The Premise is set, from here on this Path.");
  return ok;
}

/** `fantasia style`: replaces the Style, or with [add] adds a line to the end of it. */
export function style(mac: Mac, engine: Engine, storyId: string, words: string, add: string | undefined, out: Out): boolean {
  if (!words.trim() && !add?.trim()) return (out("Say the Style, or a line to add with --add."), false);
  const ok = onPath(mac, storyId, out, head => {
    const now = mac.states.at(head).style;
    const written = add?.trim() ? `${(words.trim() || now).replace(/\s+$/, "")} ${add.trim()}` : words;
    engine.setStyle(storyId, written, head, traceFor("style"));
  });
  if (ok) out("The Style is set, from here on this Path.");
  return ok;
}

/** `fantasia length`: Short, Medium or Full. */
export function length(mac: Mac, engine: Engine, storyId: string, words: string, out: Out): boolean {
  const ok = onPath(mac, storyId, out, head => { engine.setReplyLength(storyId, words, head, traceFor("length")); });
  if (ok) out(`Replies are ${words.trim().toLowerCase()} from here on this Path.`);
  return ok;
}

/** `fantasia arc`: lists the Arcs numbered; `add`, `rewrite <n>` or `drop <n>` changes them. */
export function arc(mac: Mac, engine: Engine, storyId: string, args: string[], out: Out): boolean {
  const path = mac.tree.currentPath(storyId);
  if (!path) return (out(`No Story ${storyId} on this Mac.`), false);
  const arcs = mac.states.at(path.headEntryId).arcs;
  const [action, ...rest] = args;
  if (!action) {
    if (!arcs.length) out("The Story has no Arcs.");
    arcs.forEach((line, index) => out(`${index + 1}. ${line}`));
    return true;
  }
  const numbered = (word: string | undefined) => {
    const index = Number(word) - 1;
    return Number.isInteger(index) && index >= 0 && index < arcs.length ? index : null;
  };
  let next: string[];
  let said: string;
  if (action === "add") {
    next = [...arcs, rest.join(" ")];
    said = "The Arc is added";
  } else if (action === "rewrite" || action === "drop") {
    const index = numbered(rest[0]);
    if (index === null) return (out(`Say which Arc by its number, 1 to ${arcs.length}.`), false);
    next = action === "drop" ? arcs.filter((_, at) => at !== index) : arcs.map((line, at) => at === index ? rest.slice(1).join(" ") : line);
    said = action === "drop" ? "The Arc is dropped" : "The Arc is rewritten";
  } else {
    return (out("Say add, rewrite or drop."), false);
  }
  const ok = onPath(mac, storyId, out, head => { engine.setArcs(storyId, next, head, traceFor("arc")); });
  if (ok) out(`${said}, from here on this Path.`);
  return ok;
}

export interface LandmarkOptions {
  at?: string;
  what?: string;
  drop?: boolean;
}

/** `fantasia landmark`: creates a Landmark, moves or rewrites one, or drops it; the World's past stays as it was. */
export function landmark(mac: Mac, engine: Engine, storyId: string, name: string, options: LandmarkOptions, out: Out): boolean {
  const path = mac.tree.currentPath(storyId);
  if (!path) return (out(`No Story ${storyId} on this Mac.`), false);
  const existing = mac.states.at(path.headEntryId).landmarks.find(item => item.name === name.trim());
  if (options.drop) {
    const ok = onPath(mac, storyId, out, head => { engine.dropLandmark(storyId, name, head, traceFor("landmark")); });
    if (ok) out(`${name.trim()} is dropped, from here on this Path.`);
    return ok;
  }
  if (!existing && (!options.at || !options.what)) return (out(`Say when ${name.trim()} is with --at, and what happens with --what: it is not a Landmark yet.`), false);
  const ok = onPath(mac, storyId, out, head => {
    engine.setLandmark(storyId, { name, at: options.at ?? existing?.at ?? "", what: options.what ?? existing?.what ?? "" }, !existing, head, traceFor("landmark"));
  });
  if (ok) out(existing ? `${name.trim()} is set, from here on this Path.` : `${name.trim()} is a Landmark now, from here on this Path.`);
  return ok;
}

/** `fantasia place`: creates a place or an institution, or rewrites what it is. */
export function place(mac: Mac, engine: Engine, storyId: string, name: string, description: string, institution: boolean, out: Out): boolean {
  const path = mac.tree.currentPath(storyId);
  if (!path) return (out(`No Story ${storyId} on this Mac.`), false);
  const list = mac.states.at(path.headEntryId).world[institution ? "institutions" : "places"];
  const exists = list.some(item => item.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase());
  const ok = onPath(mac, storyId, out, head => { engine.setPlace(storyId, { name, description }, institution, !exists, head, traceFor("place")); });
  if (ok) out(`${name.trim()} is ${exists ? "set" : `${institution ? "an institution" : "a place"} in the Story now`}, from here on this Path.`);
  return ok;
}

/** `fantasia world --summary/--history`: what the World is, and its history; a part left out stays as it is. */
export function worldIs(mac: Mac, engine: Engine, storyId: string, summary: string | undefined, history: string | undefined, out: Out): boolean {
  const ok = onPath(mac, storyId, out, head => {
    const now = mac.states.at(head).world;
    engine.setWorld(storyId, summary ?? now.summary, history ?? now.history, head, traceFor("world"));
  });
  if (ok) out("The World is set, from here on this Path.");
  return ok;
}

/** `fantasia clock`: moves the clock on, never back; [weekday] says which weekday Day 1 was. */
export function clock(mac: Mac, engine: Engine, storyId: string, at: string, dayOne: string | undefined, out: Out): boolean {
  const ok = onPath(mac, storyId, out, head => { engine.setClock(storyId, at, dayOne, head, traceFor("clock")); });
  if (ok) {
    const path = mac.tree.currentPath(storyId);
    const state = path ? mac.states.at(path.headEntryId) : null;
    out(`It is ${state ? say(state, state.clock) : at.trim()} now on this Path. The World catches up when it next moves.`);
  }
  return ok;
}

/**
 * `fantasia taste`: lists the Story's lessons numbered; `reword <n>` or `drop <n>` changes one. Taste is kept beside
 * the Story (docs/adr/0020), so a change holds on every Path.
 */
export function taste(mac: Mac, engine: Engine, storyId: string, args: string[], out: Out): boolean {
  const path = mac.tree.currentPath(storyId);
  if (!path) return (out(`No Story ${storyId} on this Mac.`), false);
  const lines = tasteOf(mac, storyId, "story");
  const [action, which, ...words] = args;
  if (!action) {
    if (!lines.length) out("Taste has no lessons yet.");
    lines.forEach((line, index) => out(`${index + 1}. ${line}`));
    return true;
  }
  const line = lines[Number(which) - 1];
  if (!line) return (out(lines.length ? `Say which lesson by its number, 1 to ${lines.length}.` : "Taste has no lessons yet."), false);
  if (action === "reword") {
    const ok = onPath(mac, storyId, out, () => { engine.rewordTaste(storyId, line, words.join(" "), "story", traceFor("taste")); });
    if (ok) out("The lesson is reworded, on every Path.");
    return ok;
  }
  if (action === "drop") {
    const ok = onPath(mac, storyId, out, () => { engine.removeTaste(storyId, line, "story", traceFor("taste")); });
    if (ok) out("The lesson is deleted, on every Path.");
    return ok;
  }
  return (out("Say reword or drop."), false);
}
