package com.openfantasia.app

import android.content.Context

/** The Previously cards the player dismissed, kept on the phone: the Story changes nothing when one is dismissed. */
class PrivatePreviouslyStore(context: Context) : PreviouslyStore {
    private val preferences = context.getSharedPreferences("previously_dismissed", Context.MODE_PRIVATE)
    override fun read(storyID: String): String? = preferences.getString(storyID, null)
    override fun write(storyID: String, since: String) { preferences.edit().putString(storyID, since).apply() }
}
