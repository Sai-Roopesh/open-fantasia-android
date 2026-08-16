package com.example.open_fantasia.domain.model

/**
 * The comparison key that decides whether two Cast Seeds are the same person by name.
 *
 * A Cast Roster cannot hold two members with the same name — the Mac Host and Android both reject a
 * Continuity Snapshot that does — but nothing used to stop two Cast Seeds being *created* with one
 * name, and a pasted Cast Seed mints a fresh identity every time it is applied to a blank editor. Paste
 * the same character twice and the thread acquires two seeds sharing a name, which makes the snapshot
 * rules mutually unsatisfiable: emit both and the roster has duplicates, emit one and a seed was
 * dropped. Observed in the wild as three consecutive checkpoints failing, each after a full engine run.
 *
 * So the key is stored beside the name and carries a unique index, and the rule is enforced where the
 * data is written rather than only where it is read. Normalization matches the host's exactly — trim,
 * then lowercase — so the two never disagree about who is a duplicate.
 */
fun castSeedNameKey(canonicalName: String): String = canonicalName.trim().lowercase()
