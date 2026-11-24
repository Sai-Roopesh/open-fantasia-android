# Authoring a Story File

Every field in `story.yaml` — `premise`, `style`, `world`, `places`, `institutions`, `people`, `rules`, and `brief` — stays permanently cached in Layer 1 (`storyPart`) for the entire life of the Story. Anything stiff, defensive, or clinical written at setup colours every single Reply that follows.

Write Story Files as **dramatic fiction notes**, never as policy documents or HR disclaimers.

## Keep HR-speak out at birth

- **No policy or autonomy disclaimers in `world`, `places`, `institutions`, or `rules`**: Describe what a place looks, feels, and runs like — never add corporate disclaimers about authority, workplace boundaries, or romantic autonomy. State setting facts plainly once (for example, `"Hogwarts as a university; everyone in it is eighteen or older"`) and move on.
- **No negative pink-elephant lists in `style` or `brief`**: Avoid walls of *"never do X"* rules naming clinical or preachy tropes (naming them keeps them active in context). State positively how the fiction should feel, sound, and move.
- **No moral checklists**: A Story is lived drama, not a lesson on healthy communication. Let characters want things badly, contradict themselves, melt, push back, joke, and act out of love, jealousy, ambition, or pride.

## Field-by-field craft

- **`premise`**: The emotional core, stakes, and fantasy the player came for, in a few vivid sentences.
- **`style`**: Positive voice and craft direction — genre, register, era, emotional temperature, pacing, how close or messy relationships feel, and how ordinary dialogue should sound (contractions, uneven rhythms, subtext, warmth alongside friction).
- **`people` (`who_they_are`, `after`, `voice`)**:
  - Give each Lead concrete warmth, desire, flaws, humor, and vulnerabilities — not a rigid manifesto of pride and self-defence that locks them into constant pushback.
  - Keep `known` and `bond` strictly to what the Player Character knows and has seen (`bond` ≤ 40 words).
  - Write 3–5 short, unmistakable `voice` lines per Lead that show their natural cadence (not speeches or exposition).
- **`world` (`places`, `institutions`, `groups`)**: Concrete sensory, social, and dramatic details that an Actor can actually use on the page.
- **`rules`**: Only true world mechanics and fixed setting facts (powers, era constraints, canon divergences). Never put tone policing or relationship etiquette in `rules`.
- **`brief` (`more` / `less`)**: Plain dramatic tastes the Director plans by (for example, `more: ["fast-moving rivalry", "shared domestic moments"]`, `less: ["filler interruptions", "drawn-out misunderstandings"]`).
- **`opening`**: Drop straight into an active moment with concrete physical detail and emotional tension, ending where the Player Character's first Move belongs.

## Importing

`fantasia import` validates the whole Story File before creating anything:

```sh
cd host && npm run fantasia -- import <path/to/story-folder>
```
