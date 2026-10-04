package com.openfantasia.app

import okhttp3.OkHttpClient
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager

class CertificatePin(fingerprint: String) : X509TrustManager {
    private val digest: ByteArray

    init {
        require(fingerprint.matches(Regex("[0-9a-fA-F]{64}"))) { "The Mac's certificate fingerprint is invalid" }
        digest = fingerprint.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    }

    fun matches(certificate: X509Certificate): Boolean = MessageDigest.isEqual(
        digest, MessageDigest.getInstance("SHA-256").digest(certificate.encoded)
    )

    override fun checkServerTrusted(chain: Array<out X509Certificate>, authType: String) {
        if (chain.isEmpty() || !matches(chain[0])) throw CertificateException("This certificate does not belong to the paired Mac")
        chain[0].checkValidity()
    }

    override fun checkClientTrusted(chain: Array<out X509Certificate>, authType: String) {
        throw CertificateException("Client certificates are not accepted")
    }

    override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()

    fun client(): OkHttpClient {
        val context = SSLContext.getInstance("TLS")
        context.init(null, arrayOf(this), null)
        return OkHttpClient.Builder()
            .sslSocketFactory(context.socketFactory, this)
            // Bonjour can return any address; identity comes from the scanned certificate.
            .hostnameVerifier { _, session ->
                runCatching { matches(session.peerCertificates.first() as X509Certificate) }.getOrDefault(false)
            }
            .followRedirects(false)
            .followSslRedirects(false)
            .build()
    }
}
