package com.example.open_fantasia.domain.selector

import com.example.open_fantasia.data.local.entity.ConnectionEntity

/**
 * Filters out DeepSeek connections since they are not supported/recommended as brain models.
 */
fun List<ConnectionEntity>.filterBrainConnections(): List<ConnectionEntity> {
    return this.filter { !it.provider.equals("deepseek", ignoreCase = true) }
}
