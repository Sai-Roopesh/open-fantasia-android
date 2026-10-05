import { readFileSync } from "node:fs";
import { Command } from "commander";
import { fantasiaHome } from "../home.js";
import { openMac } from "../mac.js";
import { claudeToken, doctor, importCommand, install, models, moments, pair, show, stories, trace } from "./commands.js";
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

program.command("models").argument("[setting...]", "a job, a provider, a model and an optional effort").description("Show the model for each job, or set one: fantasia models writer claude claude-sonnet-5-5")
  .action((setting: string[]) => exitWith(models(mac(), setting, out)));

program.command("moments").argument("<story>", "a Story's id").description("List the Moments a Story remembers, with who knows each")
  .action((story: string) => exitWith(moments(mac(), story, out)));

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
