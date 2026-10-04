package com.openfantasia.app

import okhttp3.mockwebserver.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import java.security.MessageDigest

class MacServer : AutoCloseable {
    private val certificate = HeldCertificate.Builder().commonName("Mac").build()
    val server = MockWebServer().apply {
        useHttps(HandshakeCertificates.Builder().heldCertificate(certificate).build().sslSocketFactory(), false)
        start()
    }
    val fingerprint = MessageDigest.getInstance("SHA-256").digest(certificate.certificate.encoded)
        .joinToString("") { "%02x".format(it) }
    val client = LinkClient(server.url("/"), fingerprint, "secret")
    override fun close() { server.shutdown() }
}
