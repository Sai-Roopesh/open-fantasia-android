package com.openfantasia.app

import java.io.File

/**
 * The kept copy (openspec presence: What has been seen can be read without the Mac): the JSON of every read that
 * succeeded, by Story (none for the list of Stories) and what was asked, replaced on each read. Backstage is never
 * kept; it is read only from the Mac.
 */
interface ReadCache {
    fun read(storyID: String?, name: String): String?
    fun write(storyID: String?, name: String, json: String)
    /** Forgets every Story the Mac no longer lists. */
    fun keepOnly(storyIDs: Set<String>)
}

class MemoryReadCache : ReadCache {
    private val kept = mutableMapOf<Pair<String?, String>, String>()
    @Synchronized override fun read(storyID: String?, name: String) = kept[storyID to name]
    @Synchronized override fun write(storyID: String?, name: String, json: String) { kept[storyID to name] = json }
    @Synchronized override fun keepOnly(storyIDs: Set<String>) { kept.keys.removeAll { it.first != null && it.first !in storyIDs } }
}

/** In the app's private files: a folder per Story, a file per read; a write lands whole or not at all. */
class FileReadCache(private val directory: File) : ReadCache {
    private fun safe(part: String) = part.replace(Regex("[^A-Za-z0-9._-]"), "_")
    private fun folder(storyID: String?) = if (storyID == null) directory else File(File(directory, "stories"), safe(storyID))
    private fun file(storyID: String?, name: String) = File(folder(storyID), safe(name) + ".json")
    @Synchronized override fun read(storyID: String?, name: String): String? = file(storyID, name).takeIf { it.isFile }?.readText()
    @Synchronized override fun write(storyID: String?, name: String, json: String) {
        val target = file(storyID, name)
        target.parentFile?.mkdirs()
        val written = File(target.parentFile, target.name + ".writing").apply { writeText(json) }
        if (!written.renameTo(target)) written.delete()
    }
    @Synchronized override fun keepOnly(storyIDs: Set<String>) {
        val kept = storyIDs.map(::safe).toSet()
        File(directory, "stories").listFiles()?.filter { it.name !in kept }?.forEach { it.deleteRecursively() }
    }
}
