package com.openfantasia.app

/** For each Story, when the player last played as of the Previously card they dismissed (SceneView.previously.since). */
interface PreviouslyStore {
    fun read(storyID: String): String?
    fun write(storyID: String, since: String)
}

internal class MemoryPreviouslyStore : PreviouslyStore {
    private val dismissed = mutableMapOf<String, String>()
    override fun read(storyID: String) = dismissed[storyID]
    override fun write(storyID: String, since: String) { dismissed[storyID] = since }
}
