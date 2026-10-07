import { readFileSync } from "node:fs";
import { Command } from "commander";
import { fantasiaHome } from "../home.js";
import { openMac } from "../mac.js";
import { Engine } from "../engine/engine.js";
import { subscriptionRunners } from "../models/runners.js";
import { Models } from "../models/model-call.js";
import { claudeToken, doctor, edit, group, importCommand, install, known, lead, models, moments, pair, person, portrait, show, stories, trace, world, type PersonOptions } from "./commands.js";
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
program.command("world").argument("<story>", "a Story's id").description("Show the World off-screen: Lives, Threads, and what happened with who knows it")
  .action((story: string) => exitWith(world(mac(), story, out)));

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
