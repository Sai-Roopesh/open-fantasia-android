package com.example.open_fantasia.data.local.db

import androidx.room.TypeConverter
import com.example.open_fantasia.domain.model.*
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer

class Converters {
    private val json = Json { ignoreUnknownKeys = true }

    @TypeConverter
    fun fromSnapshot(value: DurableMemorySnapshot?): String? {
        return value?.let { json.encodeToString(DurableMemorySnapshot.serializer(), it) }
    }

    // world_state is a NON-NULL entity field; null/malformed JSON would crash Room
    // instantiation. Return a valid empty snapshot fallback instead of null.
    @TypeConverter
    fun toSnapshot(value: String?): DurableMemorySnapshot {
        return try {
            value?.let { json.decodeFromString(DurableMemorySnapshot.serializer(), it) } ?: emptySnapshot()
        } catch (e: Exception) {
            emptySnapshot()
        }
    }

    private fun emptySnapshot(): DurableMemorySnapshot = DurableMemorySnapshot(
        metadata = SnapshotMetadata("", "", "continuation", 1),
        spatial_state = SpatialState(null, emptyList(), emptyList(), emptyList(), emptyList()),
        entity_state = emptyList(),
        relational_state = emptyList(),
        narrative_state = NarrativeState("", "", "")
    )

    @TypeConverter
    fun fromModelCache(value: List<ModelCatalogEntry>?): String? {
        return value?.let { json.encodeToString(ListSerializer(ModelCatalogEntry.serializer()), it) }
    }

    // model_cache is a NON-NULL entity field; return empty list on null/malformed JSON.
    @TypeConverter
    fun toModelCache(value: String?): List<ModelCatalogEntry> {
        return try {
            value?.let { json.decodeFromString(ListSerializer(ModelCatalogEntry.serializer()), it) } ?: emptyList()
        } catch (e: Exception) {
            emptyList()
        }
    }

    @TypeConverter
    fun fromStringList(value: List<String>?): String? {
        return value?.let { json.encodeToString(ListSerializer(serializer<String>()), it) }
    }

    // starters is a NON-NULL entity field; return empty list on null/malformed JSON.
    @TypeConverter
    fun toStringList(value: String?): List<String> {
        return try {
            value?.let { json.decodeFromString(ListSerializer(serializer<String>()), it) } ?: emptyList()
        } catch (e: Exception) {
            emptyList()
        }
    }

    @TypeConverter
    fun fromExampleConversation(value: List<ExampleConversation>?): String? {
        return value?.let { json.encodeToString(ListSerializer(ExampleConversation.serializer()), it) }
    }

    // example_conversations is a NON-NULL entity field; return empty list on null/malformed JSON.
    @TypeConverter
    fun toExampleConversation(value: String?): List<ExampleConversation> {
        return try {
            value?.let { json.decodeFromString(ListSerializer(ExampleConversation.serializer()), it) } ?: emptyList()
        } catch (e: Exception) {
            emptyList()
        }
    }
}
