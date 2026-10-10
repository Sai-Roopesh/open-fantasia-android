/**
 * Whether two ways of naming a place name the same place, as a person would read them: "the library" and "The
 * library's end table", "Hogsmeade" and "the lane up from Hogsmeade". It errs toward the same place, since a place
 * written two ways should be one place on the Day View and the World screen.
 */
export function samePlace(left: string, right: string): boolean {
  const plain = (place: string) => place.trim().toLocaleLowerCase().replace(/^the\s+/, "");
  const a = plain(left);
  const b = plain(right);
  return a.length > 0 && b.length > 0 && (a.includes(b) || b.includes(a));
}
