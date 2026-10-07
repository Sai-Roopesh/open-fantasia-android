import { readFileSync } from "node:fs";
import { Command } from "commander";
import { fantasiaHome } from "../home.js";
import { openMac } from "../mac.js";
import { Engine } from "../engine/engine.js";
import { subscriptionRunners } from "../models/runners.js";
import { Models } from "../models/model-call.js";
import { arc, claudeToken, clock, doctor, edit, group, importCommand, install, known, landmark, lead, length, models, moments, pair, person, place, portrait, premise, show, stories, style, taste, trace, world, worldIs, type LandmarkOptions, type PersonOptions } from "./commands.js";
import { serve } from "./serve.js";

/**
 * `fantasia`: everything done on the Mac rather than on the phone (openspec first-playable-scene design). It is
 * also how Claude takes in Story Files it has written, and later edits Stories (docs/adr/0002).
 */
const program = new Command("fantasia").description("Open Fantasia on this Mac");
const mac = () => openMac(fantasiaHome());
const out = (line: string) => console.log(line);
const exitWith = (ok: boolean) => process.exit(ok ? 0 : 1);

program.command("serve").description("Serve the phone: the link, the engine and the Bonjour advertisement")
  .option("--port <port>", "port to listen on", value => Number(value))
  .option("--fake-models", "answer with scripted Replies instead of calling models")
  .action(async (options: { port?: number; fakeModels?: boolean }) => serve(mac(), { ...(options.port ? { port: options.port } : {}), fakeModels: options.fakeModels ?? false }));

program.command("pair").description("Show a QR code that pairs a phone with this Mac")
  .option("--adb", "print the adb command that pairs a debug build without a camera")
  .action(async (options: { adb?: boolean }) => pair(mac(), out, { adb: options.adb ?? false }));

program.command("import").argument("<folder>", "a Story File folder").description("Take a Story File in as a new Story")
  .action((folder: string) => exitWith(importCommand(mac(), folder, out)));

program.command("stories").description("List the Stories and where each stands")
  .action(() => stories(mac(), out));

program.command("show").argument("<story>", "a Story's id").option("--entry <id>", "show one entry in full")
  .description("Show a Story's current Path, or one entry")
  .action((story: string, options: { entry?: string }) => exitWith(show(mac(), story, options.entry, out)));

program.command("models").argument("[setting...]", "a job, a provider, a model and an optional effort; or actor, a Story, and the same")
  .description("Show every job's model, each Story's Actor and what each provider offers, or set one: fantasia models weaver codex gpt-6.1-sol high; fantasia models actor \"The Night Train to Kalka\" claude claude-opus-5-5")
  .action((setting: string[]) => exitWith(models(mac(), setting, out)));

program.command("moments").argument("<story>", "a Story's id").description("List the Moments a Story remembers, with who knows each")
  .action((story: string) => exitWith(moments(mac(), story, out)));
program.command("world").argument("<story>", "a Story's id")
  .option("--summary <words>", "what the World is: set it from here on the current Path").option("--history <words>", "the World's history: set it likewise")
  .description("Show the World off-screen: Lives, Threads, and what happened with who knows it; or with --summary or --history, set what the World is")
  .action((story: string, options: { summary?: string; history?: string }) => {
    if (options.summary === undefined && options.history === undefined) return exitWith(world(mac(), story, out));
    const home = mac();
    exitWith(worldIs(home, new Engine(home, new Models(home.db, {})), story, options.summary, options.history, out));
  });

const repeated = (value: string, earlier: string[] = []) => [...earlier, value];
program.command("person").argument("<story>", "a Story's id").argument("<name>", "the person, by any name they answer to")
  .option("--who <words>", "who they are, and the backstory they come with").option("--known <words>", "what the Player Character knows of them")
  .option("--appearance <words>").option("--after <words>", "what they are after").option("--alias <name>", "another name they answer to (repeat for more)", repeated)
  .option("--voice <line>", "a line they have said (repeat for more)", repeated).option("--group <name>", "their Group; an empty name takes them out")
  .option("--portrait <file>", "an image for their Portrait")
  .description("Add someone to a Story, or change only what is given, from here on its current Path")
  .action(async (story: string, name: string, options: PersonOptions) => {
    const home = mac();
    exitWith(await person(home, new Engine(home, new Models(home.db, {})), story, name, options, out));
  });
program.command("lead").argument("<story>", "a Story's id").argument("<name>", "the person").argument("<on-or-off>")
  .description("Make someone a Lead, or stop them being one")
  .action((story: string, name: string, onOff: string) => { const home = mac(); exitWith(lead(home, new Engine(home, new Models(home.db, {})), story, name, onOff, out)); });
program.command("group").argument("<story>", "a Story's id").argument("<name>", "the Group").argument("<description...>")
  .description("Create a Group, or change its description")
  .action((story: string, name: string, words: string[]) => { const home = mac(); exitWith(group(home, new Engine(home, new Models(home.db, {})), story, name, words.join(" "), out)); });
program.command("portrait").argument("<story>", "a Story's id").argument("<name>", "the person").argument("<file>", "a JPEG, PNG or WebP image")
  .description("Replace someone's Portrait with an image on the Mac")
  .action((story: string, name: string, file: string) => { const home = mac(); exitWith(portrait(home, new Engine(home, new Models(home.db, {})), story, name, file, out)); });

// The rest of the Story (editing-the-story design decision 5).
const editing = () => { const home = mac(); return { home, engine: new Engine(home, new Models(home.db, {})) }; };
program.command("premise").argument("<story>", "a Story's id").argument("<words...>", "what the Story is for")
  .description("Set the Premise, from here on the current Path")
  .action((story: string, words: string[]) => { const { home, engine } = editing(); exitWith(premise(home, engine, story, words.join(" "), out)); });
program.command("style").argument("<story>", "a Story's id").argument("[words...]", "the Style whole").option("--add <line>", "a line to add to the end of the Style")
  .description("Set the Style, or add a line to it, from here on the current Path")
  .action((story: string, words: string[], options: { add?: string }) => { const { home, engine } = editing(); exitWith(style(home, engine, story, words.join(" "), options.add, out)); });
program.command("length").argument("<story>", "a Story's id").argument("<length>", "short, medium or full")
  .description("Set how long Replies are, from here on the current Path")
  .action((story: string, words: string) => { const { home, engine } = editing(); exitWith(length(home, engine, story, words, out)); });
program.command("arc").argument("<story>", "a Story's id").argument("[change...]", "add <words>, rewrite <n> <words>, or drop <n>")
  .description("List the Arcs numbered, or add, rewrite or drop one, from here on the current Path")
  .action((story: string, change: string[]) => { const { home, engine } = editing(); exitWith(arc(home, engine, story, change, out)); });
program.command("landmark").argument("<story>", "a Story's id").argument("<name>", "the Landmark")
  .option("--at <time>", "when it is, \"Day N HH:MM\"").option("--what <words>", "what happens").option("--drop", "take it out of the Story")
  .description("Create, move, rewrite or drop a Landmark, from here on the current Path; one the World has passed stays as it was")
  .action((story: string, name: string, options: LandmarkOptions) => { const { home, engine } = editing(); exitWith(landmark(home, engine, story, name, options, out)); });
program.command("place").argument("<story>", "a Story's id").argument("<name>", "the place").argument("<description...>", "what it is")
  .option("--institution", "an institution, rather than a place")
  .description("Create a place or an institution, or rewrite what it is, from here on the current Path")
  .action((story: string, name: string, words: string[], options: { institution?: boolean }) => { const { home, engine } = editing(); exitWith(place(home, engine, story, name, words.join(" "), options.institution ?? false, out)); });
program.command("clock").argument("<story>", "a Story's id").argument("<time>", "\"Day N HH:MM\", later than now").option("--weekday <day>", "which weekday Day 1 was")
  .description("Move the clock on, never back; the World catches up when it next moves")
  .action((story: string, time: string, options: { weekday?: string }) => { const { home, engine } = editing(); exitWith(clock(home, engine, story, time, options.weekday, out)); });
program.command("taste").argument("<story>", "a Story's id").argument("[change...]", "reword <n> <words>, or drop <n>")
  .description("List Taste's lessons numbered, or reword or delete one, from here on the current Path")
  .action((story: string, change: string[]) => { const { home, engine } = editing(); exitWith(taste(home, engine, story, change, out)); });

program.command("known").argument("<story>", "a Story's id").argument("<person>", "someone in the Story, by any name they answer to")
  .argument("<words...>", "what the Player Character knows of them").description("Set what the Player Character knows of someone, as the World screen shows it")
  .action((story: string, person: string, words: string[]) => {
    const home = mac();
    exitWith(known(home, new Engine(home, new Models(home.db, {})), story, person, words.join(" "), out));
  });

program.command("edit").argument("<story>", "a Story's id").argument("<entry>", "the Move or Reply, by its entry id")
  .argument("<words...>", "what it should read").description("Edit a Move or a Reply as the player can: the latest in place, anything earlier on a new Path")
  .action(async (story: string, entry: string, words: string[]) => {
    const home = mac();
    const runners = subscriptionRunners(home.home);
    let ok = false;
    try { ok = await edit(home, new Engine(home, new Models(home.db, runners)), story, entry, words.join(" "), out);
    } finally { runners.close(); }
    exitWith(ok);
  });

program.command("trace").argument("<id>", "a trace id the app showed").description("Show what a request asked, how it ended, and its model calls")
  .action((id: string) => exitWith(trace(mac(), id, out)));

program.command("claude-token").description("Store the Claude subscription token: paste it on stdin, or copy it from the first Open Fantasia")
  .option("--from-first-host", "copy the token the first Open Fantasia's host stored")
  .action((options: { fromFirstHost?: boolean }) => exitWith(claudeToken(options.fromFirstHost ?? false, options.fromFirstHost ? null : readFileSync(0, "utf8"), out)));

program.command("install").description("Run `fantasia serve` at login, kept running")
  .action(() => install(mac(), out));

program.command("doctor").description("Check this Mac's setup")
  .action(() => exitWith(doctor(mac(), out)));

await program.parseAsync();
