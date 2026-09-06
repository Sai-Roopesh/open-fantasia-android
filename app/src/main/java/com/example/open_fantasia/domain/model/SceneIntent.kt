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
 * Each policy is complete on its own. None is a modifier on another, and no two are ever rendered
 * together, so there is no arrangement of these that tells a model both to hold still and to interrupt.
 */
object TurnPolicy {

    fun directive(intent: SceneIntent): String = when (intent) {
        SceneIntent.Dwell -> """
            THIS TURN — stay inside this moment:
            - Do NOT introduce a new event, arrival, interruption, message, call, or change of place. Nothing enters this scene from outside it.
            - Do NOT advance an open objective. They keep. This beat is not about them.
            - Go further into what is already happening: what it costs, what it means, what is being noticed, what is not being said. A feeling that has already landed may be stayed with and deepened — that is this reply's work, not a repetition to avoid.
            - You may still act, speak, and change. Let the change be internal to this moment rather than arriving from elsewhere.
            - End inside the scene, with the user free to answer. Do not manufacture a hook.
        """.trimIndent()

        SceneIntent.Develop -> """
            THIS TURN — move within this scene:
            - Change comes from the people already present. Do NOT introduce an arrival, interruption, message, call, or event from outside the scene.
            - Give the beat one concrete development: a decision, an admission, a gesture that shifts things, a place they move to together.
            - At most one open objective may surface, and only if the people here would raise it now.
            - End on an opening the user can answer.
        """.trimIndent()

        SceneIntent.Escalate -> """
            THIS TURN — raise the stakes:
            - Introduce something the user did not supply: an action taken on your character's own initiative, an event that intrudes on the scene, a decision, a revelation, or a shift to an adjacent place.
            - You may advance an open objective from <durable_state>.
            - End on a development or an open door that pulls the user forward, not on a question that hands control back.
        """.trimIndent()

        SceneIntent.Close -> """
            THIS TURN — let this scene land:
            - Resolve rather than open. Do NOT introduce a new event, arrival, interruption, or complication.
            - Settle what this scene raised: let a decision hold, a feeling be acknowledged, or a silence be enough.
            - You do not need a hook. This scene is allowed to end, and the next one is allowed to begin elsewhere.
        """.trimIndent()
    }

    /**
     * The variation rules that apply under this intent.
     *
     * Almost all of them are about not repeating yourself and hold everywhere. One does not: forbidding
     * a landed emotional beat from being re-staged is sound advice against padding and precisely wrong
     * during an intimate scene, where staying with a feeling is the content rather than a repetition of
     * it. Under [SceneIntent.Dwell] it is replaced by a rule about deepening.
     */
    fun variationRules(intent: SceneIntent): String {
        val shared = """
            - Do NOT reuse the sentence shapes, rhythm, or opening move of your previous reply. If it opened on an action, open the next on dialogue, interiority, or the environment instead.
            - Do NOT repeat a rhetorical device you just used (lists or enumerations, rhetorical questions, ironic asides, parallel repetition). Use any one device at most once, never two replies running.
            - Do NOT reuse a physical gesture or piece of blocking from a recent beat. Reach for new, specific physicality each time.
            - Do NOT lean on one mechanical sentence rhythm; in particular, never stack short parallel/staccato sentences into the same cadence more than once in a reply.
        """.trimIndent()

        val emotional = when (intent) {
            SceneIntent.Dwell -> """
                - A feeling already shown may be returned to and taken further. Deepen it: find what is underneath it, what it costs, what it changes. Do not merely re-state it in new words, and do not resolve it early to move on.
                - A question already answered stays answered, but the subject may be sat with rather than dropped.
            """.trimIndent()
            else -> """
                - Do NOT re-play an emotional beat already shown. Once a feeling has landed, it is established — escalate it, complicate it, or move past it; never re-stage the same realization.
                - Do NOT re-ask or circle back to a question or topic already raised or answered. Answered things stay answered; pull a new thread forward instead.
            """.trimIndent()
        }

        return "$shared\n$emotional"
    }
}
