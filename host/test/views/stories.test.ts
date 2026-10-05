import { describe, expect, it } from "vitest";
import { listStories } from "../../src/views/stories.js";
import { importStoryFile } from "../../src/storyfile/import.js";
import { Engine } from "../../src/engine/engine.js";
import { FakeModels } from "../../src/models/fake.js";
import { Models } from "../../src/models/model-call.js";
import { freshHome } from "../support/host.js";
import { hogwartsStoryFile, writeStoryFile } from "../support/story-files.js";

describe("the home screen", () => {
  // GIVEN one Story mid-Scene in "After curfew" and another waiting at a Day View on Sunday at 7:40 am
  // THEN the home screen shows "Scene 14 · After curfew" for the first
  // AND "Sunday 7:40 am · choosing where to go" for the second
  it("stories › Home shows where every Story stands › Two Stories on the home screen", async () => {
    const mac = freshHome();
    const engine = new Engine(mac, new Models(mac.db, { claude: new FakeModels() }));
    const midScene = importStoryFile(writeStoryFile(hogwartsStoryFile()), mac);
    const second = hogwartsStoryFile({ title: "Sunday morning", place: "Gryffindor Tower", at: "Day 5 07:40", who: ["Neville Longbottom"], prose: "Neville is already up." });
    second.title = "After the Troll";
    const atDayView = importStoryFile(writeStoryFile(second), mac);
    if (!midScene.ok || !atDayView.ok) throw new Error("import failed");
    const head = (id: string) => mac.tree.currentPath(id)!.headEntryId;
    engine.move(atDayView.storyId, "I get dressed.", head(atDayView.storyId), "t1");
    await engine.settled(atDayView.storyId);
    engine.endScene(atDayView.storyId, head(atDayView.storyId), "t2");

    const shown = Object.fromEntries(listStories(mac).map(story => [story.title, story]));
    expect(shown["After Curfew"]).toMatchObject({ standing: "Scene 1 · After curfew", detail: "Friday 9:40 pm · with Hermione" });
    expect(shown["After the Troll"]).toMatchObject({ standing: "Sunday 7:40 am · choosing where to go", detail: "1 Scene played" });
  });
});
