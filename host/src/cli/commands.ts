import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
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
import { actorOf, DEFAULT_JOB_MODELS, JOBS, jobModels, setJobModel, setStoryActor, storyActor, type Job } from "../models/jobs.js";
import { CLAUDE_TOKEN, readSecret, storeSecret } from "../secrets.js";
import type { ModelChoice } from "../story/state.js";
import type { Payload } from "../story/entries.js";
import { worldOn } from "../story/world.js";
import { parseStoryTime, sayStoryTime } from "../time.js";
import { momentsOn } from "../story/memory.js";
import { importStoryFile } from "../storyfile/import.js";
import { Traces } from "../trace.js";
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
    case "taste_set": return `Taste: ${payload.lines.join(" / ") || "nothing"}`;
    case "chronicle": return `${payload.moments.length} Moments${payload.summary ? `: ${payload.summary}` : ""}`;
    case "world_moved": return `The World moved on to ${payload.until}: ${payload.lives.length} Lives, ${payload.happened.length} happened, ${payload.meanwhile.length} in Meanwhile`;
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
    const stories = mac.db.prepare("SELECT id, title FROM stories ORDER BY created_at").all() as { id: string; title: string }[];
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
    const found = (mac.db.prepare("SELECT id, title FROM stories WHERE id = ? OR title = ?").get(story ?? "", story ?? "") as { id: string; title: string } | undefined);
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
  if (!JOBS.includes(job as Job)) return (out(`No job "${job}". The jobs are: ${JOBS.join(", ")}, or actor "<Story>".`), false);
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
  const pc = mac.states.at(path.headEntryId).playerCharacter;
  const remembered = momentsOn(mac, path.headEntryId);
  if (remembered.length === 0) out("No Moments recorded yet.");
  for (const { moment, scene, knownTo } of remembered) {
    out(`Scene ${scene.number} · ${scene.title} · weight ${moment.weight}`);
    out(`  ${moment.what}`);
    const told = knownTo.filter(name => !moment.there.includes(name));
    out(`  There: ${moment.there.join(", ") || "only " + pc}${told.length ? ` · told: ${told.join(", ")}` : ""}`);
    for (const quote of moment.quotes) {
      const entry = mac.tree.entry(quote.entry);
      out(`  ${entry?.payload.kind === "move" ? `${pc}: ` : ""}"${quote.text}"`);
    }
  }
  return true;
}

/** `fantasia world`: the World off-screen on a Story's current Path, hidden things included, until Backstage arrives. */
export function world(mac: Mac, storyId: string, out: Out): boolean {
  const path = mac.tree.currentPath(storyId);
  if (!path) return (out(`No Story ${storyId}.`), false);
  const state = mac.states.at(path.headEntryId);
  const shown = worldOn(mac, path.headEntryId);
  const when = (at: string) => {
    const time = parseStoryTime(at);
    return time ? `${at} (${sayStoryTime(time, state.dayOneWeekday)})` : at;
  };
  out(shown.until ? `The World stands at ${when(shown.until)}.` : "The World stands where the Story File set it.");
  out("Lives:");
  for (const life of shown.lives) out(`  ${life.who}: ${life.where ?? "where not yet said"}; ${life.doing ?? "doing not yet said"}; after: ${life.after || "nothing said"}`);
  out("Threads:");
  if (shown.threads.length === 0) out("  none");
  for (const thread of shown.threads) out(`  ${thread.name}: ${thread.now}`);
  out("What happened:");
  if (shown.happened.length === 0) out("  nothing yet");
  for (const item of shown.happened) out(`  ${item.at} · ${item.where} · ${item.what} · known to: ${item.knownTo.join(", ") || "nobody"}${item.landmark ? ` · the Landmark ${item.landmark}` : ""}`);
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
  const stories = (mac.db.prepare("SELECT COUNT(*) AS n FROM stories").get() as { n: number }).n;
  checks.push(["Story store", true, `${join(mac.home, "fantasia.db")}, ${stories} ${stories === 1 ? "Story" : "Stories"}`]);
  const token = readSecret(CLAUDE_TOKEN);
  checks.push(["Claude token", token !== null, token ? "stored" : "missing: run `fantasia claude-token`"]);
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
