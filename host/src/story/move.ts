/**
 * Splits out-of-character author/director notes (`director note: ...`, `author note: ...`, `OOC: ...`,
 * `[OOC: ...]`, `(director note: ...)`) from a player's Move — whether placed at the start, middle, or end — so the
 * model obeys them as a one-shot directive without treating them as spoken dialogue or leaking them into history,
 * Chronicler records, `read_scene`, or FTS5 `story_search`.
 */
export function splitMoveNote(text: string): { move: string; note: string | null } {
  const notes: string[] = [];
  let rest = text;

  // 1. Strip any bracketed/parenthesized inline OOC or director notes anywhere in the Move.
  rest = rest.replace(/[\[(]\s*(?:director(?:'s)?\s+note|author(?:'s)?\s+note|ooc)\s*:\s*([\s\S]*?)[\])]/gi, (_full, body: string) => {
    const clean = body.trim();
    if (clean) notes.push(clean);
    return " ";
  });

  // 2. Strip a trailing labeled line (`director note: ...`, `author note: ...`, `OOC: ...`).
  const labeled = /(?:^|\n)\s*(?:director(?:'s)?\s+note|author(?:'s)?\s+note|ooc)\s*:\s*([\s\S]+)$/i.exec(rest);
  if (labeled && labeled.index !== undefined) {
    const clean = (labeled[1] ?? "").trim();
    if (clean) notes.push(clean);
    rest = rest.slice(0, labeled.index);
  }

  const move = rest.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return { move, note: notes.length ? notes.join("\n") : null };
}
