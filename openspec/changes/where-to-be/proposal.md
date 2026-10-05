# Proposal

## Why

The Day View says where and when the Player Character is and what he learned meanwhile, but it offers nothing to go
to: the only way on is to write a Move. The living specs ask for the rest of it (day-view: Up to four Happenings, The
player chooses where to be, The Gap is the player's, Missing something has consequences, Lead absence is felt, not
counted), and docs/design draws it (`DayView.dc.html`: What's on today and the choices; `Gap.dc.html`). Time is
linear: choosing one thing means not being at another, and what he misses goes on without him.

This is the Weaver's second half (the-weaver was the first). Its requirements are built as the living specs give
them, so this change has no spec deltas.

## What Changes

- The **Weaver** also says what is on today: at most four **Happenings** from the Day View's time on, each with its
  time, place, who will be there and why it matters now, the Story's own pick first. One the Player Character is
  expected at is marked "You're expected". After two Scenes without a **Lead**, the Story's pick has a Lead in it.
- The Day View offers them as drawn: Go on each, then Follow someone, Go somewhere, Skip to later (this evening,
  tomorrow, the weekend, the next Landmark) and Let the Story choose, and the player's own Move as now. A choice is a
  Move the engine writes in the player's words ("I go to the hospital wing for 11:00."), and the Writer opens the
  next Scene on it: at the Happening, with the person followed, at the place, at the later time.
- Choosing something later than now asks "What did you do in the Gap?" (`Gap.dc.html`): what goes on without him,
  and what he did, in his own words, which become part of the Story; left blank, he spends it quietly where he was.
- The World moves on over the Gap before the next Scene opens: every Happening in it goes on without him, and one he
  was expected at notices he did not come.
- The people in a Scene know what they lived through off-screen: the Actor reads what happened lately that someone
  present knows, as it reads Moments, so McGonagall knows he skipped her summons.
- Contract 7.

Not in this change: the Director, Backstage, the World screen; choosing to be somewhere other than the World's
named places (Go somewhere offers the Story's places; anything else is the player's own Move).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None: the day-view requirements are built as the living spec gives them.

## Impact

- host: the Weaver's answer gains Happenings (schema, check, prompt); a `choose` command that writes the Move and
  weaves the Gap before the turn; the Writer frames the Scene on the choice (and code checks it went there); the
  Actor's recall of what happened lately; the Day View view.
- protocol: contract version 7 (`DayView.happenings`, the choices' options, `POST /stories/{id}/choose`).
- android: What's on today, the choices and their pickers, and the Gap sheet, built to `DayView.dc.html` and
  `Gap.dc.html`.
- A choice with a Gap waits for one more Weaver call before the Writer; a choice without one does not.
