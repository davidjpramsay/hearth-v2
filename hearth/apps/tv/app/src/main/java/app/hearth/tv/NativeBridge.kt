package app.hearth.tv

import android.net.Uri
import android.webkit.WebView
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

class NativeBridge(
    private val webView: WebView,
    private val trustedOrigin: String,
    private val networkAvailable: () -> Boolean,
    private val exitApp: () -> Unit,
    private val presentationStatus: () -> PresentationSnapshot,
) {
    fun install(): Boolean {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return false
        WebViewCompat.addWebMessageListener(
            webView,
            BridgeProtocol.bridgeName,
            setOf(trustedOrigin),
        ) { _, message, sourceOrigin, isMainFrame, replyProxy ->
            if (!isMainFrame || sourceOrigin.toString().trimEnd('/') != trustedOrigin) return@addWebMessageListener
            when (BridgeProtocol.parse(message.data)) {
                NativeRequest.APP_IDENTITY -> replyProxy.postMessage(
                    JSONObject()
                        .put("type", "app.identity")
                        .put("applicationId", BuildConfig.APPLICATION_ID)
                        .put("versionName", BuildConfig.VERSION_NAME)
                        .toString(),
                )
                NativeRequest.NETWORK_STATUS -> replyProxy.postMessage(
                    JSONObject()
                        .put("type", "network.status")
                        .put("online", networkAvailable())
                        .toString(),
                )
                NativeRequest.PRESENTATION_STATUS -> replyProxy.postMessage(presentationStatus().toMessage())
                NativeRequest.EXIT_REQUEST -> exitApp()
                null -> replyProxy.postMessage("{\"type\":\"error\",\"code\":\"UNSUPPORTED_MESSAGE\"}")
            }
        }
        return true
    }

    fun sendBack(): Boolean {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.POST_WEB_MESSAGE)) return false
        WebViewCompat.postWebMessage(
            webView,
            WebMessageCompat(BridgeProtocol.backMessage),
            Uri.parse(trustedOrigin),
        )
        return true
    }

    fun sendPresentation(snapshot: PresentationSnapshot): Boolean {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.POST_WEB_MESSAGE)) return false
        // A lifecycle notification must never prevent pause/recovery if WebView is going away.
        return runCatching {
            WebViewCompat.postWebMessage(
                webView,
                WebMessageCompat(snapshot.toMessage()),
                Uri.parse(trustedOrigin),
            )
            true
        }.getOrDefault(false)
    }
}
