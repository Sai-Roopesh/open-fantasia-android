package com.openfantasia.app

import com.openfantasia.protocol.CONTRACT_VERSION
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.MockResponse
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
    fun enqueue(response: MockResponse) {
        if (response.headers["Fantasia-Contract"] == null) response.setHeader("Fantasia-Contract", CONTRACT_VERSION.toString())
        server.enqueue(response)
    }
    override fun close() { server.shutdown() }
}
