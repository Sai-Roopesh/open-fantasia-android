package com.example.open_fantasia.domain.model

/**
 * What this scene is for.
 *
 * The prompt used to carry one turn policy and fire it on every reply, whatever was happening. It
 * required a new element each time and named "an event that intrudes on the scene" as a way to supply
 * one; it required a fresh plot beat in every reply; and it forbade re-playing an emotional beat that
 * had already landed. Held together with ten open objectives delivered as authoritative state, a quiet
 * scene was not discouraged, it was unreachable — the only way to get one was for the model to disobey.
 * What that produced was a phone call, and when the phone was switched off, another phone.
 *
 * A Scene Intent selects exactly one policy, and the policies are mutually exclusive by construction.
 * That is the whole point of making this an enum rather than another line of guidance: a note asking for
 * calm, appended beneath a standing order to escalate, is one more instruction competing in a prompt
 * that already contradicts itself. This one does not compete. It replaces.
 *
 * It is chosen per reply and carried until changed, like the Active Speaker beside it.
 */
enum class SceneIntent(val id: String, val label: String, val hint: String) {

    /** Stay inside this moment. Nothing arrives from outside it. */
    Dwell("dwell", "Stay here", "Go deeper into this moment. Nothing interrupts."),

    /** Move, but only through the people already present. */
    Develop("develop", "Move along", "Change comes from whoever is already in the scene."),

    /** Raise the stakes. The old unconditional behaviour, now one choice among four. */
    Escalate("escalate", "Raise stakes", "Something new may intrude. Push the story forward."),

    /** Land this scene and let it settle. */
    Close("close", "Wind down", "Resolve rather than open. This scene may end.");

    companion object {
        val Default = Develop
        fun from(id: String?): SceneIntent = entries.firstOrNull { it.id == id } ?: Default
    }
}

/**
 * The per-turn direction a Scene Intent renders to, and the only place a "drive this turn" instruction
 * may come from.
 *
 * Each policy is one sentence, complete on its own. None is a modifier on another, and no two are ever
 * rendered together, so there is no arrangement of these that tells a model both to hold still and to
 * interrupt. The standing order that used to sit beside them in the response contract — "advance the
 * plot by at least one concrete, NEW beat in every reply" — is gone, so this really is the only source
 * of drive, which is what ADR-0019 said it should be.
 *
 * One sentence rather than five bullets, and stated as what to do rather than what not to: the Dwell
 * policy used to open with "Do NOT introduce a new event, arrival, interruption, message, call, or
 * change of place", which names six things to introduce.
 */
object TurnPolicy {

    fun directive(intent: SceneIntent, playerName: String, adjacentPlaces: List<String> = emptyList()): String =
        when (intent) {
            SceneIntent.Dwell ->
                "Stay in this moment. Nobody arrives and nothing rings; go further into what's already here \u2014 " +
                    "what it costs, what isn't being said. A feeling that's already landed can be stayed with."

            SceneIntent.Develop ->
                "Move it along from inside the room: a decision, an admission, a shift \u2014 from someone who's already here."

            SceneIntent.Escalate -> {
                val elsewhere = adjacentPlaces.filter { it.isNotBlank() }.take(3)
                val move = if (elsewhere.isEmpty()) "a move somewhere else" else "a move to ${elsewhere.joinToString(" or ")}"
                "Push. Do something $playerName didn't hand you \u2014 a choice, a revelation, someone at the door, $move."
            }

            SceneIntent.Close ->
                "Let this scene land. Settle what it raised; it's allowed to just end."
        }

    /**
     * Whether this reply should be asked to open differently from the last one. Under Dwell it should
     * not: staying with a moment often means starting where it left off.
     */
    fun asksForAFreshOpening(intent: SceneIntent): Boolean = intent != SceneIntent.Dwell
}
