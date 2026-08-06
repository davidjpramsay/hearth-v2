package app.hearth.tv

import java.net.URI

object TrustedOrigin {
    fun normalize(rawValue: String, allowDebugHttp: Boolean): String {
        val raw = rawValue.trim().trimEnd('/')
        val uri = runCatching { URI(raw) }.getOrElse {
            throw IllegalArgumentException("Enter a complete Hearth address.")
        }
        val scheme = uri.scheme?.lowercase()
            ?: throw IllegalArgumentException("Enter a complete Hearth address.")
        val host = uri.host?.lowercase()
            ?: throw IllegalArgumentException("Enter a valid Hearth host name.")
        require(uri.userInfo == null) { "The Hearth address cannot contain a username or password." }
        require(uri.query == null && uri.fragment == null) { "Enter only the Hearth server address." }
        require(uri.path.isNullOrEmpty() || uri.path == "/") { "Enter only the Hearth server address." }
        when (scheme) {
            "https" -> Unit
            "http" -> require(allowDebugHttp && isDebugHost(host)) {
                "A release television requires a private HTTPS Hearth address."
            }
            else -> throw IllegalArgumentException("Hearth supports only HTTPS addresses.")
        }
        val defaultPort = if (scheme == "https") 443 else 80
        val port = if (uri.port == -1) defaultPort else uri.port
        require(port in 1..65535) { "The Hearth address has an invalid port." }
        val renderedPort = if (port == defaultPort) "" else ":$port"
        return "$scheme://$host$renderedPort"
    }

    fun matches(origin: String, candidateUrl: String): Boolean {
        val trusted = runCatching { URI(origin) }.getOrNull() ?: return false
        val candidate = runCatching { URI(candidateUrl) }.getOrNull() ?: return false
        return trusted.scheme.equals(candidate.scheme, ignoreCase = true) &&
            trusted.host.equals(candidate.host, ignoreCase = true) &&
            effectivePort(trusted) == effectivePort(candidate) &&
            candidate.userInfo == null
    }

    private fun effectivePort(uri: URI): Int = when {
        uri.port != -1 -> uri.port
        uri.scheme.equals("https", ignoreCase = true) -> 443
        else -> 80
    }

    private fun isDebugHost(host: String): Boolean =
        host == "10.0.2.2" ||
            host == "127.0.0.1" ||
            host == "localhost"
}
