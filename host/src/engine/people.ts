import { LinkError } from "../link/errors.js";
import { nameIndex } from "../agents/names.js";
import type { Person, State } from "../story/state.js";

type Edited = Omit<Person, "portrait" | "broughtIn">;

/**
 * Checks a person the player or Claude wrote before it lands on the Path (editing-people design decision 2): a name
 * and who they are, no name or other name that is already someone else's, a Group the Story has, and the Player
 * Character in no Group. Returns the person tidied, or the reason in words the phone shows.
 */
export function checkPerson(state: State, person: Edited, creating: boolean): { ok: true; person: Edited } | { ok: false; reason: string } {
  const name = person.name.trim();
  if (!name) return { ok: false, reason: "Give them a name." };
  const exists = state.people[name] !== undefined;
  if (creating && exists) return { ok: false, reason: `${name} is already in the Story.` };
  if (!creating && !exists) return { ok: false, reason: `${name} is not in the Story.` };
  if (!person.whoTheyAre.trim()) return { ok: false, reason: `Say who ${name} is.` };
  const others = nameIndex(Object.values(state.people).filter(other => other.name !== name));
  const aliases = [...new Set(person.aliases.map(alias => alias.trim()).filter(Boolean))];
  for (const called of [name, ...aliases]) {
    const taken = others.get(called.toLocaleLowerCase());
    if (taken) return { ok: false, reason: called === name ? `${name} is already in the Story.` : `"${called}" is already ${taken}'s name.` };
  }
  const group = person.group?.trim() || null;
  if (group && name === state.playerCharacter) return { ok: false, reason: `${name} is the Player Character, and is in no Group.` };
  if (group && !state.groups.some(each => each.name === group)) return { ok: false, reason: `The Story has no Group called ${group}.` };
  return {
    ok: true,
    person: {
      name, aliases, whoTheyAre: person.whoTheyAre.trim(), known: person.known?.trim() || null,
      appearance: person.appearance.trim(), after: person.after.trim(), knows: person.knows.map(line => line.trim()).filter(Boolean),
      voice: person.voice.map(line => line.trim()).filter(Boolean), group
    }
  };
}

/** An uploaded Portrait's largest size (openspec stories: Portraits are real images). */
export const MAX_PORTRAIT_BYTES = 10 * 1024 * 1024;

const IMAGE_TYPES: Record<string, { extension: string; name: string; is: (bytes: Buffer) => boolean }> = {
  "image/jpeg": { extension: ".jpg", name: "JPEG", is: bytes => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  "image/png": { extension: ".png", name: "PNG", is: bytes => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/webp": { extension: ".webp", name: "WebP", is: bytes => bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP" }
};

/** The file extension for an uploaded image, once it is the type it says and small enough; refuses it otherwise. */
export function portraitExtension(image: Buffer, type: string): string {
  const kind = IMAGE_TYPES[(type.split(";")[0] ?? "").trim().toLowerCase()];
  if (!kind) throw new LinkError("invalid", "A Portrait is a JPEG, PNG or WebP image.");
  if (image.length > MAX_PORTRAIT_BYTES) throw new LinkError("invalid", "A Portrait can be at most 10 MB.");
  if (!kind.is(image)) throw new LinkError("invalid", `That file is not the ${kind.name} image it says it is.`);
  return kind.extension;
}

