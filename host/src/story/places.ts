/** Generic single-word room/location nouns that must not match distinct specific places ("Hall" vs "Great Hall"). */
const GENERIC = new Set(["hall", "room", "corridor", "office", "door", "street", "road", "floor", "table", "house", "building", "courtyard", "garden", "stairs", "wing", "tower", "chamber", "shop", "bar", "club", "park"]);

const wordMatch = (haystack: string, needle: string) =>
  new RegExp(`(?:^|[^\\p{L}\\p{N}])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^\\p{L}\\p{N}])`, "u").test(haystack);

/**
 * Whether two ways of naming a place name the same place, as a person would read them: "the library" and "The
 * library's end table", "Hogsmeade" and "the lane up from Hogsmeade". Matches on whole-word boundaries and refuses
 * bare generic nouns ("Hall" vs "Great Hall") so unrelated rooms never collapse into one card.
 */
export function samePlace(left: string, right: string): boolean {
  const plain = (place: string) => place.trim().toLocaleLowerCase().replace(/^the\s+/, "");
  const a = plain(left);
  const b = plain(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (!GENERIC.has(b) && wordMatch(a, b)) return true;
  if (!GENERIC.has(a) && wordMatch(b, a)) return true;
  return false;
}
