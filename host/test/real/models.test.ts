import { describe, expect, it } from "vitest";
import { ClaudeRunner } from "../../src/models/claude.js";
import { Models } from "../../src/models/model-call.js";
import { CLAUDE_TOKEN, readSecret } from "../../src/secrets.js";
import { freshHome } from "../support/host.js";

const token = readSecret(CLAUDE_TOKEN);

describe.skipIf(!token)("model calls on Claude", () => {
  it("answers in JSON matching the schema it was given", async () => {
    const { db, home } = freshHome();
    const runner = new ClaudeRunner(home, () => token);
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["note", "intensity", "taste"],
      properties: {
        note: { type: "string" },
        intensity: { type: "integer", minimum: 1, maximum: 5 },
        taste: { type: ["string", "null"] }
      }
    };
    const answer = await new Models(db, { claude: runner }).call({
      agent: "writer",
      model: { provider: "claude", model: "claude-sonnet-5-5" },
      system: "You plan scenes in a story. Answer as asked.",
      prompt: "A woman on a night train looks up from her book. Write a one-line note on what she does next, rate how much is at stake from 1 to 5, and leave taste null.",
      schema,
      traceId: "real-json",
      storyId: null
    });
    runner.close();
    expect(answer.json).toMatchObject({ note: expect.any(String), intensity: expect.any(Number), taste: null });
  });
});
