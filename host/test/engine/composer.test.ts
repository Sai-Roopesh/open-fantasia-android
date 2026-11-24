import { describe, expect, it } from "vitest";
import { playable } from "../support/play.js";
import { besideOf, editNote, writeNote } from "../../src/store/beside.js";
import { Engine } from "../../src/engine/engine.js";
import { Models } from "../../src/models/model-call.js";
import { FakeModels } from "../../src/models/fake.js";
import { openHome } from "../support/host.js";
import { learnLesson } from "../../src/store/beside.js";
import { scriptedRunners } from "../../src/models/runners.js";
import { parseComposedAnswer } from "../../src/agents/composer.js";
import { checkWriter } from "../../src/agents/writer.js";

describe("a Scene's prompts share their beginning, so the provider's cache is read (docs/adr/0025)", () => {
  it("sends each Reply's request with everything the last one had up to the end of the Scene's words, unchanged", async () => {
    const s = playable();
    await s.play("I sit beside Hermione.");
    await s.play("I ask what she is reading.");
    await s.play("I wait for her answer.");
    const [, second, third] = s.models.requests.filter(request => request.agent === "actor");
    expect(third!.system).toBe(second!.system);
    const shared = second!.prompt.slice(0, second!.prompt.indexOf("\n</scene_so_far>"));
    expect(shared).toContain("<scene_so_far>");
    expect(third!.prompt.startsWith(shared)).toBe(true);
    // What changes with every Reply comes after the Scene's words.
    expect(third!.prompt.indexOf("<scene_now>")).toBeGreaterThan(third!.prompt.indexOf("</scene_so_far>"));
    expect(third!.prompt.slice(0, third!.prompt.indexOf("<scene_so_far>"))).not.toMatch(/Beats:|Here besides/);
  });

  it("keeps the prompt cache prefix stable across moves_to location changes and newly mentioned characters, and delivers real multi-turn conversation history", async () => {
    const s = playable(undefined, {
      writer: [
        { answer: JSON.stringify({ frame: { title: "After curfew", place: "The Gryffindor common room", purpose: "p", exit: "e" }, comes_in: [], goes: [], beats: [], note: "n", call: "continue", intensity: 2, minutes: 2, in_play: [], moves_to: null }) },
        { answer: JSON.stringify({ frame: null, comes_in: [], goes: [], beats: [], note: "n", call: "continue", intensity: 2, minutes: 5, in_play: [], moves_to: "The corridor outside" }) },
        { answer: JSON.stringify({ frame: null, comes_in: [], goes: [], beats: [], note: "n", call: "continue", intensity: 2, minutes: 3, in_play: [], moves_to: null }) }
      ]
    });
    await s.play("I sit beside Hermione.");
    await s.play("We step into the corridor.");
    await s.play("I ask if Hagrid left the lantern here.");
    const [, second, third] = s.models.requests.filter(request => request.agent === "actor");
    const shared = second!.prompt.slice(0, second!.prompt.indexOf("\n</scene_so_far>"));
    expect(third!.prompt.startsWith(shared)).toBe(true);
    // Current moved location and newly mentioned non-Lead character appear after the cached transcript.
    expect(third!.prompt.slice(third!.prompt.indexOf("<scene_now>"))).toContain("Now at: The corridor outside.");
    expect(third!.prompt.slice(third!.prompt.indexOf("<scene_now>"))).toContain("<mentioned>");
    expect(third!.prompt.slice(third!.prompt.indexOf("<scene_now>"))).toContain("Rubeus Hagrid");
    // Real alternating user/assistant turns for direct transports, strictly append-only across consecutive turns
    // (including keeping Turn N's final user Move byte-identical on Turn N+1 so Codex hits 97%+ KV cache).
    expect(second!.conversation?.map(turn => turn.role)).toEqual(["user", "assistant", "user", "assistant", "user"]);
    expect(third!.conversation?.map(turn => turn.role)).toEqual(["user", "assistant", "user", "assistant", "user", "assistant", "user"]);
    expect(third!.conversation!.slice(0, second!.conversation!.length)).toEqual(second!.conversation);
    expect(third!.schema).toBeUndefined();

    // Active Directions live in Turn 0 so consecutive turns with an active Direction remain strictly append-only.
    writeNote(s.mac, s.storyId, "Keep the tension sharp and dry.");
    await s.play("I wait for Hermione to answer.");
    await s.play("I tap the table once.");
    const [fourth, fifth] = s.models.requests.filter(request => request.agent === "actor").slice(-2);
    expect(fourth!.conversation![0]!.text).toContain("<active_directions>");
    expect(fourth!.conversation![0]!.text).toContain("Keep the tension sharp and dry.");
    expect(fifth!.conversation!.slice(0, fourth!.conversation!.length)).toEqual(fourth!.conversation);
  });

  it("parses free-text prose with trailing <scene_state> and tolerates omitted metadata or done beats mentioning past player moves", async () => {
    expect(parseComposedAnswer("Jean doesn't blink.\n\n<scene_state>\n{\"minutes\":3,\"moves_to\":null}\n</scene_state>")).toEqual({
      reply: "Jean doesn't blink.",
      meta: { minutes: 3, moves_to: null }
    });
    expect(parseComposedAnswer("Pure prose with no state block.")).toEqual({
      reply: "Pure prose with no state block.",
      meta: null
    });
    const s = playable();
    await s.play("I ask Hermione whether she is coming inside.");
    const checked = checkWriter(
      { state: s.state(), scene: s.mac.tree.pathTo(s.head()), move: "I wait.", choice: null, beside: besideOf(s.mac, s.storyId, s.head()) },
      [],
      {
        frame: null, comes_in: [], goes: [],
        beats: [{ text: "Roopesh asks whether Hermione is coming inside", status: "done" }, { text: "Hermione weighs whether to trust him.", status: "in_play" }],
        note: "Hermione hesitates by the doorway.", call: "continue", intensity: 2, minutes: 2, in_play: [], moves_to: null
      }
    );
    expect(checked.ok).toBe(true);
  });
});

describe("one writing generation with shared Directions", () => {
  it("plans and writes in one provider call, then independently checks the Reply", async () => {
    const s = playable();
    await s.play("I sit beside Hermione.");
    expect(s.models.requests.map(request => request.agent)).toEqual(["actor", "editor"]);
    expect(s.path().at(-1)).toMatchObject({ kind: "reply" });
    expect(s.view().turn.kind).toBe("idle");
  });

  it("keeps unremembered Redo corrections one-shot, while remembered Redo notes persist across Moves and restart until archived", async () => {
    const s = playable(undefined, { actor: [{ answer: "Hermione turns a page without speaking." }] });
    await s.play("I sit beside Hermione.");
    const oneShot = "what ororo? she is not even here";
    s.engine.redo(s.storyId, s.head(), oneShot, false, "redo-local");
    await s.engine.settled(s.storyId);
    const localRevision = s.models.requests.filter(request => request.agent === "actor").at(-1)!;
    expect(localRevision.prompt).toContain(oneShot);
    expect(localRevision.prompt).toContain("Hermione turns a page without speaking.");
    expect(localRevision.prompt).toContain("<revision>");
    expect(localRevision.conversation?.at(-1)?.text).toContain(oneShot);
    expect(localRevision.conversation?.[0]?.text).not.toContain(oneShot);
    expect(besideOf(s.mac, s.storyId, s.head()).notes.some(note => note.text === oneShot)).toBe(false);

    await s.play("I listen.");
    const afterOneShot = s.models.requests.filter(request => request.agent === "actor").at(-1)!;
    expect(afterOneShot.prompt).not.toContain(oneShot);
    expect(afterOneShot.prompt).not.toContain("<revision>");
    expect(afterOneShot.conversation?.map(turn => turn.text).join("\n")).not.toContain(oneShot);

    // Now test remember=true: persists across later Moves and restart until archived.
    const direction = "Keep her familiar, and let her finish the anecdote without asking me another question.";
    s.engine.redo(s.storyId, s.head(), direction, true, "redo-remember");
    await s.engine.settled(s.storyId);
    const remembered = s.models.requests.filter(request => request.agent === "actor").at(-1)!;
    expect(remembered.prompt).toContain(direction);
    expect(remembered.prompt).toContain("<revision>");
    await s.play("I nod once.");
    const later = s.models.requests.filter(request => request.agent === "actor").at(-1)!;
    expect(later.prompt).toContain(direction);
    expect(later.prompt).not.toContain("<revision>");
    expect(s.models.editor.requests.at(-1)!.prompt).toContain(direction);
    const fake = new FakeModels();
    const restarted = new Engine(s.mac, new Models(s.mac.db, scriptedRunners(fake)));
    restarted.move(s.storyId, "I wait.", s.head(), "after-restart");
    await restarted.settled(s.storyId);
    expect(fake.requests[0]!.prompt).toContain(direction);
    const note = besideOf(s.mac, s.storyId).notes.find(note => note.text === direction)!;
    editNote(s.mac, s.storyId, note.id, "Let this quiet moment continue.", false);
    restarted.move(s.storyId, "I sip my tea.", s.head(), "archived");
    await restarted.settled(s.storyId);
    expect(fake.requests.filter(request => request.agent === "actor").at(-1)!.prompt).not.toContain("Let this quiet moment continue.");
    expect(besideOf(s.mac, s.storyId).notes.find(item => item.id === note.id)).toMatchObject({ active: false });
  });

  it("purges legacy unremembered Redo rows from existing databases on open and keeps rewrites cached with Redo direction intact", async () => {
    const s = playable(undefined, {
      actor: [
        { answer: "Hermione stares at the hearth." },
        // First rewrite draft hijacks player dialogue; second rewrite fixes it and includes an unclosed <scene_state>.
        { answer: "\"Leave me alone,\" you mutter, pulling back." },
        { answer: "Hermione sets the book down without answering.\n\n<scene_state>{\"minutes\":2}" }
      ]
    });
    // Turn off model editor to exercise the default free code-check rewrite path.
    const { setEditsEveryReply } = await import("../../src/models/jobs.js");
    setEditsEveryReply(s.mac.home, false);
    await s.play("I sit down.");
    const oneShot = "keep her quiet, no Ororo";
    s.engine.redo(s.storyId, s.head(), oneShot, false, "redo-rewrite");
    await s.engine.settled(s.storyId);

    // The code check caught `"Leave me alone," you mutter` and rewrote using the same cached system prompt and one-shot Redo direction.
    const actorCalls = s.models.requests.filter(request => request.agent === "actor");
    expect(actorCalls).toHaveLength(3); // initial move + redo draft + rewrite draft
    const [redoDraft, rewriteCall] = actorCalls.slice(-2);
    expect(rewriteCall!.system).toBe(redoDraft!.system);
    expect(rewriteCall!.conversation!.slice(0, -1)).toEqual(redoDraft!.conversation!.slice(0, -1));
    expect(rewriteCall!.conversation!.at(-1)!.text).toContain(oneShot);
    expect(rewriteCall!.conversation!.at(-1)!.text).toContain("<sent_back>");
    expect(s.view().exchanges.at(-1)!.reply!.text).toBe("Hermione sets the book down without answering.");

    // Simulate a legacy DB that still has an unremembered Redo row sitting in steering_notes.
    const redoEntry = s.mac.tree.pathTo(s.head()).find(entry => entry.payload.kind === "redo")!;
    s.mac.db.prepare("INSERT OR REPLACE INTO steering_notes (id, story_id, text, written_at, answered_by, active, source_entry, remember) VALUES (?, ?, ?, ?, NULL, 1, ?, 0)")
      .run(redoEntry.id, s.storyId, oneShot, new Date().toISOString(), redoEntry.id);
    const reopened = openHome(s.mac.home);
    expect(besideOf(reopened, s.storyId, s.head()).notes.some(note => note.text === oneShot)).toBe(false);
    reopened.db.close();
  });

  it("strips unclosed or malformed <scene_state> tags on parse, display, and history replay, and delivers full context on Codex wire turns", async () => {
    expect(parseComposedAnswer("Her hand stays on your sleeve.\n\n<scene_state>{\"minutes\":2,\"intensity\":4}")).toEqual({
      reply: "Her hand stays on your sleeve.",
      meta: { minutes: 2, intensity: 4 }
    });
    expect(parseComposedAnswer("She stops at the door.\n\n<scene_state>{\"minutes\":2,\"inten")).toEqual({
      reply: "She stops at the door.",
      meta: null
    });

    const { codexBody, conversationOf } = await import("../../src/models/wire.js");
    const { fakeChronicleAnswer } = await import("../../src/models/fake.js");
    const s = playable(undefined, {
      chronicler: [{
        from: request => {
          const base = JSON.parse((fakeChronicleAnswer(request) as { answer: string }).answer) as { moments: { what: string; quotes: { entry: string; text: string }[]; there: string[]; weight: number }[] };
          return { answer: JSON.stringify({ ...base, moments: base.moments.map(m => ({ ...m, there: ["Hermione Granger"] })) }) };
        }
      }],
      actor: [
        { answer: "Hermione marks her place." },
        { answer: "She closes the book." },
        { answer: "She slides the page toward you." }
      ]
    });
    await s.play("I sit beside Hermione.");
    // End Scene 1 so Scene 2 has <story_so_far>, <long_run>, and <remembered> Moments, then open Scene 2 from Day View.
    s.engine.endScene(s.storyId, s.head(), "end-1");
    await s.engine.ended(s.storyId);
    await s.play("I meet Hermione in the library.");
    await s.play("I ask what she found.");
    await s.play("I lean over the table.");

    const actorCalls = s.models.requests.filter(request => request.agent === "actor");
    const scene2Open = codexBody(conversationOf(actorCalls[1]!), "gpt-6.1-sol", { story: [], web: false });
    const scene2OpenInput = scene2Open.input as { role: string; content: { text: string }[] }[];
    // Opening Scene 2 from Day View sends a single fresh Turn 0 — never replaying closed Scene 1's raw exchanges.
    expect(scene2OpenInput).toHaveLength(1);
    expect(scene2OpenInput[0]!.content[0]!.text).toContain("<story_so_far>");
    expect(scene2OpenInput[0]!.content[0]!.text).toContain("<long_run>");
    expect(scene2OpenInput[0]!.content[0]!.text).toContain("<remembered>");
    expect(scene2OpenInput[0]!.content[0]!.text).toContain("<now>");
    expect(scene2OpenInput[0]!.content[0]!.text).not.toContain("Hermione marks her place.");

    // Mid-Scene 2 turns deliver <long_run>, <remembered>, and clear on-Path vs. off-screen cast inside Turn 0,
    // and remain strictly append-only on the exact Codex wire payload (preserving 97%+ KV cache).
    const scene2Turn2 = codexBody(conversationOf(actorCalls[2]!), "gpt-6.1-sol", { story: [], web: false });
    const scene2Turn3 = codexBody(conversationOf(actorCalls[3]!), "gpt-6.1-sol", { story: [], web: false });
    const turn2Input = scene2Turn2.input as { role: string; content: { text: string }[] }[];
    const turn3Input = scene2Turn3.input as { role: string; content: { text: string }[] }[];
    const turn0Text = turn2Input[0]!.content[0]!.text;
    expect(turn0Text).toContain("<long_run>");
    expect(turn0Text).toContain("<remembered>");
    expect(turn0Text).toContain("Appeared on this Path so far:");
    expect(turn0Text).toContain("Off-screen background cast not yet seen on this Path");
    expect(turn0Text).toContain("Presence: off-screen Lead");
    expect(turn3Input.slice(0, turn2Input.length)).toEqual(turn2Input);

    // Legacy saved Replies with leaked unclosed <scene_state> are scrubbed from both SceneView and future model history.
    const leaked = s.mac.tree.append(s.storyId, s.head(), {
      kind: "reply", text: "She taps the table.\n\n<scene_state>{\"minutes\":2}", callId: "c-leak", model: { provider: "codex", model: "gpt-6.1-sol" }
    });
    s.mac.tree.moveHead(s.mac.tree.currentPath(s.storyId)!.id, s.head(), leaked.id);
    expect(s.view().exchanges.at(-1)!.reply!.text).toBe("She taps the table.");
    await s.play("I look at the margin notes.");
    const afterLeak = s.models.requests.filter(request => request.agent === "actor").at(-1)!;
    expect(afterLeak.conversation!.map(turn => turn.text).join("\n")).not.toContain("<scene_state>");
  });

  it("maps Story replyLength to Codex verbosity, splits inline director notes cleanly, and advances clock on time-skip scene_state", async () => {
    const { codexBody, conversationOf } = await import("../../src/models/wire.js");
    const { passages } = await import("../../src/agents/chronicler.js");
    const { composeReply } = await import("../../src/agents/composer.js");
    const { ScriptedRunner } = await import("../../src/models/scripted.js");

    // Leading bold scene headers are stripped cleanly from prose.
    expect(parseComposedAnswer("**Friday, 27 November — Xavier estate**\n\nEmma kisses you back.\n\n<scene_state>{\"days\":6,\"time\":\"09:00\"}</scene_state>")).toEqual({
      reply: "Emma kisses you back.",
      meta: { days: 6, time: "09:00" }
    });

    const s = playable();
    await s.play("I sit beside Hermione.\n\ndirector note:\nmake her sharp and impatient");
    const firstCall = s.models.requests.filter(request => request.agent === "actor").at(-1)!;
    expect(firstCall.conversation!.at(-1)!.text).toContain("<director_note>");
    expect(firstCall.conversation!.at(-1)!.text).toContain("make her sharp and impatient");
    expect((codexBody(conversationOf(firstCall), "gpt-6.1-sol", { story: [], web: false }).text as { verbosity: string }).verbosity).toBe("medium");

    // Switch to Short reply length and play next Move: verbosity drops to low, and old inline director note is stripped from history & Chronicler passages.
    s.engine.setReplyLength(s.storyId, "short", s.head(), "len-short");
    await s.play("I tap the table.");
    const secondCall = s.models.requests.filter(request => request.agent === "actor").at(-1)!;
    expect((codexBody(conversationOf(secondCall), "gpt-6.1-sol", { story: [], web: false }).text as { verbosity: string }).verbosity).toBe("low");
    expect(secondCall.conversation!.map(turn => turn.text).join("\n")).not.toContain("make her sharp and impatient");
    expect(passages(s.mac.tree.pathTo(s.head())).map(item => item.text).join("\n")).not.toContain("director note");

    // Time-skip scene_state (`days` + `time`) advances the real Story clock instead of freezing on the old day.
    const runner = new ScriptedRunner([{ answer: "**Next Friday — Great Hall**\n\nShe is already waiting.\n\n<scene_state>{\"days\":6,\"time\":\"09:00\",\"place\":\"The Great Hall\"}</scene_state>" }]);
    const res = await composeReply(
      new Models(s.mac.db, { codex: runner }),
      [{ provider: "codex", model: "gpt-6.1-sol" }],
      { state: s.state(), scene: s.mac.tree.pathTo(s.head()), move: "time skip 6 days to morning", choice: null, beside: besideOf(s.mac, s.storyId, s.head()) },
      s.storyId, "trace-skip", new AbortController().signal
    );
    expect(res.value.reply).toBe("She is already waiting.");
    expect(res.value.plan.clock).toBe("Day 9 09:00");
    expect(res.value.plan.movesTo).toBe("The Great Hall");
  });

  it("resumes the saved draft after an Editor failure, including after a worker restart", async () => {
    const s = playable(undefined, { editor: [{ fail: "editor unavailable" }, { fail: "editor unavailable" }] });
    await s.play("I sit down.");
    expect(s.view().turn).toMatchObject({ kind: "failed", job: "editor" });
    const generated = s.models.requests.filter(request => request.agent === "actor").length;
    const fake = new FakeModels();
    const restarted = new Engine(s.mac, new Models(s.mac.db, scriptedRunners(fake)));
    restarted.retry(s.storyId, "retry-check");
    await restarted.settled(s.storyId);
    expect(fake.requests.map(request => request.agent)).toEqual(["editor"]);
    expect(s.models.requests.filter(request => request.agent === "actor")).toHaveLength(generated);
    expect(s.path().at(-1)).toMatchObject({ kind: "reply" });
  });

  it("keeps one instruction snapshot throughout a generation", async () => {
    const s = playable(undefined, { editor: [{ fail: "editor unavailable" }, { fail: "editor unavailable" }] });
    const note = writeNote(s.mac, s.storyId, "Keep the conversation quiet.");
    await s.play("I sit down.");
    editNote(s.mac, s.storyId, note.id, "Now make her angry.", true);
    s.engine.retry(s.storyId, "retry");
    await s.engine.settled(s.storyId);
    const check = s.models.editor.requests.at(-1)!;
    expect(check.prompt).toContain("Keep the conversation quiet.");
    expect(check.prompt).not.toContain("Now make her angry.");
    await s.play("I wait.");
    expect(s.models.requests.filter(request => request.agent === "actor").at(-1)!.prompt).toContain("Now make her angry.");
  });

  it("migrates a legacy inferred lesson to its exact Direction without changing played entries", async () => {
    const s = playable();
    await s.play("I sit down.");
    const direction = "Keep the family argument unresolved.";
    s.engine.redo(s.storyId, s.head(), direction, true, "redo");
    await s.engine.settled(s.storyId);
    const before = s.mac.tree.pathTo(s.head()).map(entry => entry.id);
    learnLesson(s.mac, s.storyId, "story", "Legacy paraphrase.");
    s.mac.db.prepare("INSERT INTO traces (id, method, path, request, started_at) VALUES (?, ?, ?, ?, ?)").run("legacy", "POST", `/stories/${s.storyId}/redo`, JSON.stringify({ direction }), new Date().toISOString());
    s.mac.db.prepare("INSERT INTO calls (id, trace_id, story_id, agent, provider, model, request, answer, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run("legacy", "legacy", s.storyId, "writer", "claude", "opus", "{}", JSON.stringify({ taste: "Legacy paraphrase." }), new Date().toISOString());
    const reopened = openHome(s.mac.home);
    const beside = besideOf(reopened, s.storyId);
    expect(beside.taste).not.toContain("Legacy paraphrase.");
    expect(beside.notes).toContainEqual(expect.objectContaining({ text: direction, active: true }));
    expect(reopened.tree.pathTo(s.head()).map(entry => entry.id)).toEqual(before);
    expect(reopened.db.prepare("SELECT active FROM taste WHERE line = ?").get("Legacy paraphrase.")).toEqual({ active: 0 });
    reopened.db.close();
  });

  it("does not repeatedly attempt a provider whose subscription access is disabled", async () => {
    const s = playable(undefined, { actor: [{ fail: "Your organization has disabled Claude subscription access for Claude Code" }] });
    await s.play("I sit down.");
    await s.play("I wait.");
    const calls = s.mac.db.prepare("SELECT provider, error FROM calls").all() as { provider: string; error: string | null }[];
    expect(calls.filter(call => call.provider === "claude")).toHaveLength(1);
    expect(s.view().turn.kind).toBe("idle");
  });
});
