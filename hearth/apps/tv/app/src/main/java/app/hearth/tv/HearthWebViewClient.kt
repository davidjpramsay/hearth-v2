package app.hearth.tv

import android.net.http.SslError
import android.os.Build
import android.webkit.RenderProcessGoneDetail
import android.webkit.SafeBrowsingResponse
import android.webkit.SslErrorHandler
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.annotation.RequiresApi
import java.io.ByteArrayInputStream

class HearthWebViewClient(
    private val trustedOrigin: String,
    private val onReady: (String) -> Unit,
    private val onUnavailable: (String?) -> Unit,
) : WebViewClient() {
    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
        !TrustedOrigin.matches(trustedOrigin, request.url.toString())

    override fun shouldInterceptRequest(
        view: WebView,
        request: WebResourceRequest,
    ): WebResourceResponse? {
        val scheme = request.url.scheme?.lowercase()
        if (scheme != "http" && scheme != "https") return blockedResponse()
        return if (TrustedOrigin.matches(trustedOrigin, request.url.toString())) null else blockedResponse()
    }

    override fun onPageCommitVisible(view: WebView, url: String) {
        if (TrustedOrigin.matches(trustedOrigin, url)) onReady(url)
    }

    override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
        if (TrustedOrigin.matches(trustedOrigin, url)) onReady(url)
    }

    override fun onReceivedError(
        view: WebView,
        request: WebResourceRequest,
        error: WebResourceError,
    ) {
        if (request.isForMainFrame) onUnavailable(error.description?.toString())
    }

    override fun onReceivedHttpError(
        view: WebView,
        request: WebResourceRequest,
        errorResponse: WebResourceResponse,
    ) {
        if (request.isForMainFrame && errorResponse.statusCode >= 400) {
            onUnavailable("Hearth returned ${errorResponse.statusCode}.")
        }
    }

    override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
        handler.cancel()
        onUnavailable("Hearth could not verify the private server certificate.")
    }

    @RequiresApi(Build.VERSION_CODES.O_MR1)
    override fun onSafeBrowsingHit(
        view: WebView,
        request: WebResourceRequest,
        threatType: Int,
        callback: SafeBrowsingResponse,
    ) {
        callback.backToSafety(true)
        onUnavailable("Android blocked unsafe web content.")
    }

    override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
        onUnavailable("Android System WebView stopped unexpectedly.")
        return true
    }

    private fun blockedResponse(): WebResourceResponse = WebResourceResponse(
        "text/plain",
        "UTF-8",
        403,
        "Blocked by Hearth",
        emptyMap(),
        ByteArrayInputStream("Blocked by Hearth".toByteArray()),
    )
}
