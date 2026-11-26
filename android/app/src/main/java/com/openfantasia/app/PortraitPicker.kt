package com.openfantasia.app

/** An image chosen on the phone for a Portrait: its bytes, and its type ("image/png"). */
class PickedImage(val bytes: ByteArray, val type: String)

/**
 * Chooses an image for a Portrait (openspec stories: Portraits are real images): the system photo picker in the app,
 * which needs no permission, and a given image in the shared checks. Null when the player chose nothing.
 */
fun interface PortraitPicker { suspend fun pick(): PickedImage? }
