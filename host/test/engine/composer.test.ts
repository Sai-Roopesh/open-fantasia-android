import { describe, expect, it } from "vitest";
import { playable } from "../support/play.js";
import { besideOf, editNote, writeNote } from "../../src/store/beside.js";
import { Engine } from "../../src/engine/engine.js";
import { Models } from "../../src/models/model-call.js";
import { FakeModels } from "../../src/models/fake.js";
import { openHome } from "../support/host.js";
import { scriptedRunners } from "../../src/models/runners.js";
import { parseComposedAnswer, planFromMeta, proseStreamFilter, recordDue } from "../../src/agents/composer.js";
import { playerPartIn } from "../../src/agents/editor.js";
import { sceneEndWeave } from "../../src/engine/scene-end.js";
import { storyTools } from "../../src/store/story-tools.js";
import { splitMoveNote } from "../../src/story/move.js";
import { samePlace } from "../../src/story/places.js";

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

  it("parses free-text prose with trailing <scene_state> forgivingly per field without wiping valid updates", async () => {
    expect(parseComposedAnswer("Jean doesn't blink.\n\n<scene_state>\n{\"minutes\":3,\"moves_to\":null}\n</scene_state>")).toEqual({
      reply: "Jean doesn't blink.",
      meta: { minutes: 3, moves_to: null }
    });
    expect(parseComposedAnswer("Pure prose with no state block.")).toEqual({
      reply: "Pure prose with no state block.",
      meta: null
    });
    // Live prose stream filter never leaks <scene_state> even when split across SSE token chunks.
    const streamed: string[] = [];
    const feed = proseStreamFilter(delta => streamed.push(delta));
    for (const chunk of ["She looks ", "up slowly.\n\n<sce", "ne_state>{\"minutes\":2}</scene_state>"]) feed(chunk);
    expect(streamed.join("")).toBe("She looks up slowly.");
    const s = playable();
    await s.play("I ask Hermione whether she is coming inside.");
    const planned = planFromMeta(
      { state: s.state(), scene: s.mac.tree.pathTo(s.head()), move: "I wait.", choice: null, beside: besideOf(s.mac, s.storyId, s.head()) },
      { place: "The Astronomy Tower", minutes: 30, entered: ["Draconia Malfoy", "Nonexistent Ghost"], intensity: 99 }
    );
    expect(planned.ok).toBe(true);
    if (planned.ok) {
      expect(planned.plan.movesTo).toBe("The Astronomy Tower");
      expect(planned.plan.here).toContain("Draconia Malfoy");
      expect(planned.plan.intensity).toBe(2);
      expect(planned.dropped.some(d => d.includes("Nonexistent Ghost"))).toBe(true);
    }
    expect(recordDue(s.state(), s.mac.tree.pathTo(s.head()))).toBe(false);
  });

  it("keeps Turn 0 byte-identical across Focus/Linger toggles and emits mid-scene state deltas on the active Move turn", async () => {
    const s = playable(undefined, {
      actor: [
        { answer: "Hermione opens the door.\n\n<scene_state>{\"minutes\":45,\"place\":\"The Corridor\"}</scene_state>" },
        { answer: "She glances down the corridor.\n\n<scene_state>{\"minutes\":2}</scene_state>" },
        { answer: "She stops by the window." }
      ]
    });
    await s.play("I follow her out.");
    s.engine.setFocus(s.storyId, s.head(), "Hermione Granger", "focus-1");
    s.engine.setLinger(s.storyId, s.head(), true, "linger-1");
    await s.play("I catch up beside her.");
    s.engine.setLinger(s.storyId, s.head(), false, "linger-2");
    await s.play("I point at the window.");

    const actorCalls = s.models.requests.filter(request => request.agent === "actor");
    expect(actorCalls[1]!.conversation![0]).toEqual(actorCalls[0]!.conversation![0]);
    expect(actorCalls[2]!.conversation![0]).toEqual(actorCalls[0]!.conversation![0]);
    expect(actorCalls[1]!.conversation!.at(-1)!.text).toContain("Now at: The Corridor.");
    expect(actorCalls[1]!.conversation!.at(-1)!.text).toContain("Focus is on Hermione Granger.");
    expect(actorCalls[1]!.conversation!.at(-1)!.text).toContain("Linger is on:");
  });

  it("allows physical sensations landing on you and multi-paragraph speech without false-positive rewrites, strips OOC notes from tools, matches places strictly, and weaves multi-day in-scene skips", async () => {
    const s = playable(undefined, {
      actor: [
        { answer: "She shoves you against the stone. You feel the cold stone at your back and you breathe in the damp air.\n\n<scene_state>{\"days\":2,\"time\":\"09:00\"}</scene_state>" }
      ]
    });
    const state = s.state();
    expect(playerPartIn(state, "She slaps you hard. You feel the sharp sting on your cheek and the wall at your back.")).toBeNull();
    expect(playerPartIn(state, "You breathe in the cold rain outside.")).toBeNull();
    expect(playerPartIn(state, "You feel a wave of guilt wash over you.")).not.toBeNull();
    // Standard multi-paragraph character speech (unclosed opening quote at end of paragraph 1) must not invert narration & dialogue.
    expect(playerPartIn(state, "\"Listen carefully, you think you know everything.\n\n\"You decide nothing here,\" she snaps, stepping closer.")).toBeNull();

    // OOC notes stripped anywhere in a Move, including from read_scene and search_story.
    expect(splitMoveNote("[OOC: keep her furious] I open the door.")).toEqual({ move: "I open the door.", note: "keep her furious" });
    await s.play("[OOC: SECRET_DIRECTIVE_TOKEN] I open the door.");
    const tools = storyTools(s.mac.db, s.storyId, s.head());
    const readScene = tools.find(t => t.name === "read_scene")!.run({ number: 1 }).answer;
    const searchOoc = tools.find(t => t.name === "search_story")!.run({ words: "SECRET_DIRECTIVE_TOKEN" }).answer;
    expect(readScene).not.toContain("SECRET_DIRECTIVE_TOKEN");
    expect(searchOoc).toContain("Nothing in this Story");

    // Generic room nouns do not collapse distinct places, while specific places still match.
    expect(samePlace("Hall", "The Great Hall")).toBe(false);
    expect(samePlace("Room", "The Common Room")).toBe(false);
    expect(samePlace("The library", "The library's end table")).toBe(true);

    // Multi-day in-scene skip must weave from scene start (not post-skip endedAt) so off-screen Landmarks are never erased.
    s.engine.endScene(s.storyId, s.head(), "end-skip");
    const closedHead = s.mac.tree.pathTo(s.head()).find(e => e.payload.kind === "scene_closed")!.id;
    const weave = sceneEndWeave(s.mac, closedHead, s.mac.states.at(closedHead));
    expect(weave.from).toBe(s.mac.states.at(closedHead).scene!.at);
    await s.engine.ended(s.storyId);
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

    // Even if an unremembered Redo row sits in steering_notes, besideOf never surfaces remember=0 rows.
    const redoEntry = s.mac.tree.pathTo(s.head()).find(entry => entry.payload.kind === "redo")!;
    s.mac.db.prepare("INSERT OR REPLACE INTO steering_notes (id, story_id, text, written_at, active, source_entry, remember) VALUES (?, ?, ?, ?, 1, ?, 0)")
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
    // Opening Scene 2 from Day View sends developer(Story Bible) + developer(rules+instructions) + a single fresh Turn 0,
    // never replaying closed Scene 1's raw exchanges.
    expect(scene2OpenInput).toHaveLength(3);
    expect(scene2OpenInput[0]!.role).toBe("developer");
    expect(scene2OpenInput[1]!.role).toBe("developer");
    const openTurn0 = scene2OpenInput[2]!.content[0]!.text;
    expect(openTurn0).toContain("<story_so_far>");
    expect(openTurn0).toContain("<long_run>");
    expect(openTurn0).toContain("<remembered>");
    expect(openTurn0).toContain("<now>");
    expect(openTurn0).not.toContain("Hermione marks her place.");

    // Mid-Scene 2 turns deliver <long_run>, <remembered>, and clear on-Path vs. off-screen cast inside Turn 0,
    // and remain strictly append-only on the exact Codex wire payload (preserving 92–98% KV cache across Codex models).
    const scene2Turn2 = codexBody(conversationOf(actorCalls[2]!), "gpt-6.1-sol", { story: [], web: false });
    const scene2Turn3 = codexBody(conversationOf(actorCalls[3]!), "gpt-6.1-sol", { story: [], web: false });
    const turn2Input = scene2Turn2.input as { role: string; content: { text: string }[] }[];
    const turn3Input = scene2Turn3.input as { role: string; content: { text: string }[] }[];
    const turn0Text = turn2Input[2]!.content[0]!.text;
    const storySoFarEnd = openTurn0.indexOf("</story_so_far>") + "</story_so_far>".length;
    expect(storySoFarEnd).toBeGreaterThan(50);
    expect(turn0Text.startsWith(openTurn0.slice(0, storySoFarEnd))).toBe(true);
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
    expect((codexBody(conversationOf(firstCall), "gpt-6.1-sol", { story: [], web: false }).text as { verbosity: string }).verbosity).toBe("high");

    // Switch to Medium reply length: verbosity maps to medium, and old inline director note is stripped from history & Chronicler passages.
    s.engine.setReplyLength(s.storyId, "medium", s.head(), "len-medium");
    await s.play("I tap the table.");
    const secondCall = s.models.requests.filter(request => request.agent === "actor").at(-1)!;
    expect((codexBody(conversationOf(secondCall), "gpt-6.1-sol", { story: [], web: false }).text as { verbosity: string }).verbosity).toBe("medium");
    expect(secondCall.conversation!.map(turn => turn.text).join("\n")).not.toContain("make her sharp and impatient");
    expect(passages(s.mac.tree.pathTo(s.head())).map(item => item.text).join("\n")).not.toContain("director note");

    // Switch to Short reply length: verbosity maps to low.
    s.engine.setReplyLength(s.storyId, "short", s.head(), "len-short");
    await s.play("I glance at the fire.");
    const thirdCall = s.models.requests.filter(request => request.agent === "actor").at(-1)!;
    expect((codexBody(conversationOf(thirdCall), "gpt-6.1-sol", { story: [], web: false }).text as { verbosity: string }).verbosity).toBe("low");

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

  it("does not repeatedly attempt a provider whose subscription access is disabled", async () => {
    const s = playable(undefined, { actor: [{ fail: "Your organization has disabled Claude subscription access for Claude Code" }] });
    await s.play("I sit down.");
    await s.play("I wait.");
    const calls = s.mac.db.prepare("SELECT provider, error FROM calls").all() as { provider: string; error: string | null }[];
    expect(calls.filter(call => call.provider === "claude")).toHaveLength(1);
    expect(s.view().turn.kind).toBe("idle");
  });
});
