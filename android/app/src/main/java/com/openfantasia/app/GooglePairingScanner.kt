package com.openfantasia.app

import android.app.Activity
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class GooglePairingScanner(activity: Activity) : PairingScanner {
    private val scanner = GmsBarcodeScanning.getClient(activity, GmsBarcodeScannerOptions.Builder()
        .setBarcodeFormats(Barcode.FORMAT_QR_CODE).enableAutoZoom().build())
    override suspend fun scan(): String = suspendCancellableCoroutine { continuation ->
        scanner.startScan()
            .addOnSuccessListener { barcode ->
                if (continuation.isActive) {
                    barcode.rawValue?.let { continuation.resume(it) }
                        ?: continuation.resumeWithException(LinkFailure("The QR code has no pairing details"))
                }
            }
            .addOnFailureListener {
                if (continuation.isActive) continuation.resumeWithException(LinkFailure("The QR code could not be scanned. Try again."))
            }
            .addOnCanceledListener { continuation.cancel() }
    }
}
