package com.example.open_fantasia.domain.model

/**
 * Converts a thread's reply-length preset into the transport ceiling a provider is actually sent.
 *
 * These are different quantities, and conflating them truncated replies mid-word. The preset is a
 * statement about how much *prose* the user wants, and [com.example.open_fantasia.domain.reducer.PromptBuilder]
 * already steers that through a written length directive, because a token cap does not make a model
 * write longer or shorter — it only decides where the text is cut off.
 *
 * A reasoning model spends part of its completion budget on chain-of-thought that never reaches the
 * transcript. Measured on `deepseek-v4-pro`, a 2048-token cap produced 1,669 tokens of hidden
 * reasoning and 379 tokens of prose; a 4096-token cap produced 4,025 hidden and 71 visible. Both
 * returned `finish_reason: length` with the reply severed mid-sentence, and raising the preset made
 * it worse rather than better, because reasoning expands into whatever room it is given.
 *
 * So the cap sent over the wire is the requested prose plus headroom for thinking. The user-facing
 * preset is unchanged, and the frozen Roleplay Generation Request still records the intent rather
 * than the transport detail — per ADR-0006 the ceiling is an adapter capability, not story context.
 */
object ReplyBudget {

    /**
     * Room for chain-of-thought on top of the requested prose. Sized above the largest reasoning
     * burst observed on a full-length roleplay prompt, since the failure mode of too little headroom
     * is a severed reply while the cost of too much is nothing: an unused ceiling is never billed.
     */
    const val REASONING_HEADROOM_TOKENS = 8192

    /**
     * Providers whose completion budget includes reasoning the transcript never sees.
     *
     * Kept as an explicit list rather than inferred from the model name: a provider that starts
     * emitting hidden reasoning should be added deliberately, and a wrong guess here silently
     * truncates replies again.
     */
    private val REASONING_PROVIDERS = setOf("deepseek")

    fun emitsHiddenReasoning(provider: String): Boolean =
        provider.trim().lowercase() in REASONING_PROVIDERS

    /**
     * The `max_tokens` value to send for a reply the user asked to be [replyTokens] long.
     *
     * Non-reasoning providers are left exactly as before, so this cannot change behaviour where it
     * was already correct.
     */
    fun transportCeiling(replyTokens: Int, provider: String): Int =
        if (emitsHiddenReasoning(provider)) replyTokens + REASONING_HEADROOM_TOKENS else replyTokens
}
