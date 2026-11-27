import { afterEach, describe, expect, it } from "vitest";
import { cleanRephrasedText, isCensorshipRefusal } from "../../src/agents/rephraser.js";
import { rephraser as rephraserCommand } from "../../src/cli/commands.js";
import { jobModels, rephrasesEveryReply, setEditsEveryReply, setJobModel, setRephrasesEveryReply } from "../../src/models/jobs.js";
import { opencodeMessagesBody, splitStorySystem } from "../../src/models/opencode-wire.js";
import { conversationOf } from "../../src/models/wire.js";
import type { ModelsView } from "../../src/protocol/generated/link.js";
import { writeNote } from "../../src/store/beside.js";
import { runningMac } from "../support/link.js";
import { playable } from "../support/play.js";

const closers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

describe("the Rephraser (Human Speech Agent)", () => {
  it("flips autoregressive self-poisoning into auto-nectar while preserving KV-cache prefixes on both Actor and Rephraser", async () => {
    const s = playable(undefined, {
      actor: [
        { answer: "Term one: sit down. Term two: eat. That's a finding, not a compliment — filed in the ledger." },
        { answer: "She closes the book. It's a habit, not an apology — entered into the record." },
        { answer: "She looks over the table. That's the arithmetic, and it's not close." }
      ],
      rephraser: [
        { answer: "Hermione sets the mug down hard enough to rattle the saucer. \"Sit down and eat before it goes cold.\"" },
        { answer: "She shuts the book with her thumb still marking the page. \"I'm not apologising for staying up, if that's what you're waiting for.\"" },
        { answer: "She looks across the table at you, tired and a little stubborn. \"I just don't know what else you want me to say.\"" }
      ]
    });
    setEditsEveryReply(s.mac.home, false);
    setJobModel(s.mac.home, "rephraser", { provider: "opencode", model: "grok-4.7", effort: "medium" });
    writeNote(s.mac, s.storyId, "Keep Hermione warm underneath the irritation.");

    await s.play("I pull out the chair across from her.");
    await s.play("I glance at the book she has been reading.");
    await s.play("I wait a moment before answering.");

    const actorCalls = s.models.requests.filter(request => request.agent === "actor");
    const rephraseCalls = s.models.requests.filter(request => request.agent === "rephraser");
    expect(actorCalls).toHaveLength(3);
    expect(rephraseCalls).toHaveLength(3);

    // Canonical Path keeps ONLY the humanized Replies — never the raw robotic drafts.
    const replies = s.path().filter(entry => entry.kind === "reply").map(entry => entry.text);
    expect(replies).toEqual([
      "Hermione sets the mug down hard enough to rattle the saucer. \"Sit down and eat before it goes cold.\"",
      "She shuts the book with her thumb still marking the page. \"I'm not apologising for staying up, if that's what you're waiting for.\"",
      "She looks across the table at you, tired and a little stubborn. \"I just don't know what else you want me to say.\""
    ]);

    // Auto-nectar: on Turn 2 and Turn 3, BOTH Actor and Rephraser see the humanized Turn 1 Reply (never the robotic draft).
    const actorTurn2Text = actorCalls[1]!.conversation!.map(t => t.text).join("\n");
    expect(actorTurn2Text).toContain("rattle the saucer");
    expect(actorTurn2Text).not.toContain("Term one:");
    expect(actorTurn2Text).not.toContain("filed in the ledger");

    // Rephraser receives the full cached Story Bible, standing context, active Directions, and <draft_reply>, with no tools or schema lock.
    expect(rephraseCalls[0]!.model).toEqual({ provider: "opencode", model: "grok-4.7", effort: "medium" });
    expect(rephraseCalls[0]!.schema).toBeUndefined();
    expect(rephraseCalls[0]!.tools).toBeUndefined();
    expect(rephraseCalls[0]!.system).toContain("<story>");
    expect(rephraseCalls[0]!.system).toContain("<people>");
    expect(rephraseCalls[0]!.conversation![0]!.text).toContain("<people_now>");
    expect(rephraseCalls[0]!.conversation![0]!.text).toContain("<active_directions>");
    expect(rephraseCalls[0]!.conversation!.at(-1)!.text).toContain("<draft_reply>");
    expect(rephraseCalls[0]!.conversation!.at(-1)!.text).toContain("Term one: sit down.");

    // Shared Story Bible prefix up to </people> matches Actor byte-for-byte.
    expect(splitStorySystem(rephraseCalls[0]!.system)[0]).toBe(splitStorySystem(actorCalls[0]!.system)[0]);

    // Actor remains 100% strictly append-only across consecutive turns.
    expect(actorCalls[2]!.conversation!.slice(0, actorCalls[1]!.conversation!.length)).toEqual(actorCalls[1]!.conversation);

    // Rephraser remains byte-identical across turns right up to its explicit cache_control breakpoint (turns.length - 2).
    const r2 = rephraseCalls[1]!.conversation!;
    const r3 = rephraseCalls[2]!.conversation!;
    expect(r3.slice(0, r2.length - 1)).toEqual(r2.slice(0, r2.length - 1));
    const wiredR2 = opencodeMessagesBody(conversationOf(rephraseCalls[1]!), "claude-haiku-5-5", { story: [] });
    const wiredR3 = opencodeMessagesBody(conversationOf(rephraseCalls[2]!), "claude-haiku-5-5", { story: [] });
    const msgs2 = wiredR2.messages as { role: string; content: unknown }[];
    const msgs3 = wiredR3.messages as { role: string; content: unknown }[];
    // Breakpoint at turns.length - 2 on Turn 2 matches Turn 3's same assistant turn text verbatim.
    const bp2 = msgs2[msgs2.length - 2]!.content as { text: string; cache_control: { type: string } }[];
    expect(bp2[0]!.cache_control).toEqual({ type: "ephemeral" });
    expect(msgs3[msgs2.length - 2]!.content).toBe(bp2[0]!.text);

    // Live streaming: only the Rephraser's humanized deltas reach the phone, never the Actor's raw draft.
    const deltas = s.events.filter(item => item.event.kind === "reply_delta").map(item => item.event.kind === "reply_delta" ? item.event.delta : "").join("");
    expect(deltas).toContain("rattle the saucer");
    expect(deltas).not.toContain("Term one: sit down.");
  });

  it("rejects censorship refusals and over-truncated rewrites, repairs cleanly, and catches player-part slips", async () => {
    expect(isCensorshipRefusal("I'm sorry, I cannot fulfill this request as it violates my content policy.", "She pulls you close by the collar.")).toBe(true);
    expect(isCensorshipRefusal("She shakes her head. \"I cannot do this tonight.\"", "She shakes her head.")).toBe(false);
    expect(cleanRephrasedText("<reply>She leans against the doorframe.\n\n<scene_state>{\"minutes\":2}</scene_state></reply>")).toBe("She leans against the doorframe.");

    const longDraft = Array.from({ length: 160 }, (_, i) => `word${i}`).join(" ");
    const s = playable(undefined, {
      actor: [
        { answer: longDraft },
        { answer: "Hermione sets the parchment down and looks straight at you." }
      ],
      rephraser: [
        // 1st attempt: refusal -> rejected and repaired.
        { answer: "I'm sorry, but I cannot rewrite explicit or intense scenes." },
        // 2nd attempt (repair): full faithful rewrite -> accepted.
        { answer: Array.from({ length: 120 }, (_, i) => `human${i}`).join(" ") },
        // Next turn: accidentally writes player's speech -> caught by playerPartIn and rewritten cleanly.
        { answer: "\"Fine,\" you say, stepping back from the table. Hermione frowns." },
        { answer: "Hermione sets the parchment down and watches you across the table, waiting." }
      ]
    });
    setEditsEveryReply(s.mac.home, false);
    setRephrasesEveryReply(s.mac.home, true);

    await s.play("I step closer to her.");
    expect(s.path().at(-1)).toMatchObject({ kind: "reply", text: expect.stringContaining("human0") });
    expect(s.path().at(-1)).not.toMatchObject({ text: expect.stringContaining("cannot rewrite") });

    await s.play("I wait for her answer.");
    const latest = s.path().at(-1);
    expect(latest).toMatchObject({ kind: "reply", text: "Hermione sets the parchment down and watches you across the table, waiting." });
    expect(latest && "note" in latest ? latest.note : undefined).toBeUndefined();
  });

  it("checkpoints the Actor draft so a failed Rephraser retries straight at the Rephraser step with another model", async () => {
    const s = playable(undefined, {
      actor: [{ answer: "Term one: stay quiet. Term two: listen." }],
      rephraser: [
        { fail: "OpenCode model overloaded" },
        { fail: "OpenCode backup overloaded" },
        { answer: "Hermione lowers her voice. \"Stay quiet and listen for a second.\"" }
      ]
    });
    setEditsEveryReply(s.mac.home, false);
    setJobModel(s.mac.home, "rephraser", { provider: "opencode", model: "grok-4.7", effort: "medium" });

    await s.play("I lean in.");
    expect(s.view().turn.kind).toBe("failed");
    expect(s.view().turn.reason).toContain("The Reply could not be rephrased");
    expect(s.models.requests.filter(r => r.agent === "actor")).toHaveLength(1);

    // Retry with a different OpenCode model runs ONLY the Rephraser — Actor is not re-run.
    s.engine.retry(s.storyId, "retry-rephraser", { provider: "opencode", model: "glm-5.3", effort: "high" });
    await s.engine.settled(s.storyId);
    expect(s.models.requests.filter(r => r.agent === "actor")).toHaveLength(1);
    expect(s.models.rephraser.requests.at(-1)!.model).toEqual({ provider: "opencode", model: "glm-5.3", effort: "high" });
    expect(s.path().at(-1)).toMatchObject({ kind: "reply", text: "Hermione lowers her voice. \"Stay quiet and listen for a second.\"" });
  });

  it("configures Rephraser from the phone's existing Models screen (writer wire slot) and CLI without breaking APK compatibility", async () => {
    const running = await runningMac();
    closers.push(running.close);

    // Initially off until configured.
    const initial = await (await running.call("/models")).json() as ModelsView;
    const initialRow = initial.jobs.find(job => job.job === "writer")!;
    expect(initialRow.title).toBe("Rephraser");
    expect(initialRow.model.label).toBe("Off");
    expect(rephrasesEveryReply(running.mac.home)).toBe(false);

    // Phone taps a model in the Rephraser row -> PUT /models/jobs/writer enables Rephraser on that OpenCode model.
    const set = await running.call("/models/jobs/writer", {
      method: "PUT",
      body: JSON.stringify({ model: { provider: "opencode", model: "grok-4.7", effort: "high" } })
    });
    expect(set.status).toBe(200);
    const updated = await set.json() as ModelsView;
    expect(updated.jobs.find(job => job.job === "writer")!.model.label).toBe("Grok 4.7 · high");
    expect(jobModels(running.mac.home).rephraser).toEqual({ provider: "opencode", model: "grok-4.7", effort: "high" });
    expect(rephrasesEveryReply(running.mac.home)).toBe(true);

    // CLI and HTTP toggle can disable and re-enable cleanly.
    const lines: string[] = [];
    expect(rephraserCommand(running.mac, "off", line => lines.push(line))).toBe(true);
    expect(rephrasesEveryReply(running.mac.home)).toBe(false);
    expect(lines.at(-1)).toContain("Rephraser is off");

    const enabled = await running.call("/models/rephraser-enabled", { method: "PUT", body: JSON.stringify({ enabled: true }) });
    expect(enabled.status).toBe(200);
    expect(rephrasesEveryReply(running.mac.home)).toBe(true);
  });
});
