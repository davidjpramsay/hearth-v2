package app.hearth.tv

import android.annotation.SuppressLint
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import java.util.concurrent.Executors

class MainActivity : ComponentActivity() {
    private lateinit var root: FrameLayout
    private lateinit var recovery: RecoveryView
    private lateinit var credentialStore: CredentialStore
    private lateinit var localState: LocalStateStore
    private val pairingClient = PairingClient()
    private val networkExecutor = Executors.newSingleThreadExecutor()
    private val handler = Handler(Looper.getMainLooper())
    private var webView: WebView? = null
    private var nativeBridge: NativeBridge? = null
    private var pairingGeneration = 0
    private var hasResumed = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        credentialStore = CredentialStore(this)
        localState = LocalStateStore(this)
        root = FrameLayout(this)
        recovery = RecoveryView(this)
        root.addView(
            recovery,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )
        setContentView(root)
        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() = handleBack()
            },
        )
        enterTelevisionMode()
        bootstrap()
    }

    override fun onResume() {
        super.onResume()
        enterTelevisionMode()
        webView?.onResume()
        if (hasResumed) revalidateOnResume() else hasResumed = true
    }

    override fun onPause() {
        webView?.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        pairingGeneration += 1
        handler.removeCallbacksAndMessages(null)
        destroyWebView()
        networkExecutor.shutdownNow()
        super.onDestroy()
    }

    private fun bootstrap() {
        val credential = credentialStore.load()
        if (credential === null) {
            showServerEntry()
        } else {
            validateCredential(credential)
        }
    }

    private fun showServerEntry(error: String? = null) {
        pairingGeneration += 1
        recovery.showServerEntry(
            initialOrigin = localState.serverOrigin ?: BuildConfig.DEFAULT_SERVER_ORIGIN,
            error = error,
            onConnect = ::beginPairing,
        )
    }

    private fun beginPairing(rawOrigin: String) {
        val origin = runCatching { TrustedOrigin.normalize(rawOrigin, BuildConfig.DEBUG) }
            .getOrElse {
                showServerEntry(it.message)
                return
            }
        localState.serverOrigin = origin
        val generation = ++pairingGeneration
        recovery.showConnecting("Asking Hearth for a private pairing code…")
        networkExecutor.execute {
            runCatching { pairingClient.start(origin, BuildConfig.VERSION_NAME) }
                .onSuccess { session -> onMain(generation) { showPairing(origin, session, generation) } }
                .onFailure { error ->
                    onMain(generation) {
                        recovery.showOffline(
                            pairingErrorMessage(error),
                            { beginPairing(origin) },
                            ::changeAddress,
                        )
                    }
                }
        }
    }

    private fun showPairing(origin: String, session: PairingSession, generation: Int) {
        recovery.showPairing(
            code = session.code,
            onNewCode = { beginPairing(origin) },
            onChangeAddress = ::changeAddress,
        )
        handler.postDelayed({ pollPairing(origin, session, generation) }, pairingPollMillis)
    }

    private fun pollPairing(origin: String, session: PairingSession, generation: Int) {
        if (generation != pairingGeneration) return
        networkExecutor.execute {
            runCatching { pairingClient.status(origin, session.pairingId) }
                .onSuccess { status ->
                    onMain(generation) {
                        when (status) {
                            "approved" -> exchangePairing(origin, session, generation)
                            "pending" -> handler.postDelayed(
                                { pollPairing(origin, session, generation) },
                                pairingPollMillis,
                            )
                            else -> recovery.showOffline(
                                "That pairing code expired. Ask Hearth for a new one.",
                                { beginPairing(origin) },
                                ::changeAddress,
                            )
                        }
                    }
                }
                .onFailure { error ->
                    onMain(generation) {
                        recovery.showOffline(
                            pairingErrorMessage(error),
                            { pollPairing(origin, session, generation) },
                            ::changeAddress,
                        )
                    }
                }
        }
    }

    private fun exchangePairing(origin: String, session: PairingSession, generation: Int) {
        recovery.showConnecting("Finishing the private television connection…")
        networkExecutor.execute {
            runCatching { pairingClient.exchange(origin, session) }
                .onSuccess { device ->
                    val credential = TvCredential(
                        serverOrigin = origin,
                        deviceId = device.deviceId,
                        householdId = device.householdId,
                        pairingSecret = session.pairingSecret,
                    )
                    credentialStore.save(credential)
                    onMain(generation) { installCredentialAndLoad(credential) }
                }
                .onFailure { error ->
                    onMain(generation) {
                        recovery.showOffline(
                            pairingErrorMessage(error),
                            { pollPairing(origin, session, generation) },
                            ::changeAddress,
                        )
                    }
                }
        }
    }

    private fun validateCredential(credential: TvCredential) {
        val generation = ++pairingGeneration
        recovery.showConnecting("Reconnecting this television…")
        networkExecutor.execute {
            runCatching {
                pairingClient.validate(credential.serverOrigin, credential.pairingSecret)
            }.onSuccess { session ->
                onMain(generation) {
                    if (
                        session.deviceId != credential.deviceId ||
                        session.householdId != credential.householdId
                    ) {
                        showRevoked()
                    } else {
                        installCredentialAndLoad(credential)
                    }
                }
            }.onFailure { error ->
                onMain(generation) {
                    if (error is PairingClientException && error.statusCode in setOf(401, 403)) {
                        showRevoked()
                    } else {
                        recovery.showOffline(
                            pairingErrorMessage(error),
                            { validateCredential(credential) },
                            ::changeAddress,
                        )
                    }
                }
            }
        }
    }

    private fun revalidateOnResume() {
        val credential = credentialStore.load() ?: return
        val generation = pairingGeneration
        networkExecutor.execute {
            runCatching {
                pairingClient.validate(credential.serverOrigin, credential.pairingSecret)
            }.onSuccess { session ->
                if (
                    session.deviceId != credential.deviceId ||
                    session.householdId != credential.householdId
                ) {
                    onMain(generation) { showRevoked() }
                }
            }.onFailure { error ->
                if (error is PairingClientException && error.statusCode in setOf(401, 403)) {
                    onMain(generation) { showRevoked() }
                }
            }
        }
    }

    private fun showRevoked() {
        pairingGeneration += 1
        credentialStore.clear()
        CookieManager.getInstance().removeAllCookies(null)
        destroyWebView()
        recovery.showRevoked { showServerEntry() }
    }

    private fun installCredentialAndLoad(credential: TvCredential) {
        val secureAttribute = if (credential.serverOrigin.startsWith("https://")) "; Secure" else ""
        val cookie = "$deviceCookie=${credential.pairingSecret}; Path=/; HttpOnly; SameSite=Strict$secureAttribute"
        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setCookie(credential.serverOrigin, cookie) { accepted ->
            onMain(pairingGeneration) {
                if (!accepted) {
                    recovery.showOffline(
                        "Android could not secure the television session.",
                        { installCredentialAndLoad(credential) },
                        ::changeAddress,
                    )
                    return@onMain
                }
                cookieManager.flush()
                createWebView(credential.serverOrigin)
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView(origin: String) {
        destroyWebView()
        val view = WebView(this).apply {
            setBackgroundColor(getColor(R.color.hearth_canvas))
            isFocusable = true
            isFocusableInTouchMode = true
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                allowFileAccess = false
                allowContentAccess = false
                javaScriptCanOpenWindowsAutomatically = false
                setSupportMultipleWindows(false)
                useWideViewPort = true
                loadWithOverviewMode = true
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                mediaPlaybackRequiresUserGesture = true
                userAgentString = "$userAgentString HearthTV/${BuildConfig.VERSION_NAME}"
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) safeBrowsingEnabled = true
            }
            webChromeClient = WebChromeClient()
            webViewClient = HearthWebViewClient(
                trustedOrigin = origin,
                onReady = ::showWebContent,
                onUnavailable = ::showWebUnavailable,
            )
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        val bridge = NativeBridge(view, origin, ::networkAvailable, ::finishAfterTransition)
        if (!bridge.install()) {
            view.destroy()
            recovery.showWebViewUpdate()
            return
        }
        webView = view
        nativeBridge = bridge
        root.addView(
            view,
            0,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )
        val path = localState.lastPath.takeIf { it.startsWith('/') } ?: "/today"
        view.loadUrl(origin + path)
    }

    private fun showWebContent(url: String) {
        val uri = Uri.parse(url)
        localState.lastPath = uri.encodedPath?.takeIf(String::isNotBlank) ?: "/today"
        recovery.visibility = View.GONE
        webView?.apply {
            visibility = View.VISIBLE
            requestFocus()
        }
    }

    private fun showWebUnavailable(message: String?) {
        webView?.visibility = View.GONE
        recovery.showOffline(familyReachabilityMessage(message), ::bootstrap, ::changeAddress)
    }

    private fun changeAddress() {
        pairingGeneration += 1
        credentialStore.clear()
        localState.clearOrigin()
        CookieManager.getInstance().removeAllCookies(null)
        destroyWebView()
        showServerEntry()
    }

    private fun handleBack() {
        if (recovery.visibility == View.VISIBLE) {
            finishAfterTransition()
            return
        }
        val view = webView
        if (view == null || nativeBridge?.sendBack() != true) {
            if (view?.canGoBack() == true) view.goBack() else finishAfterTransition()
        }
    }

    private fun destroyWebView() {
        val view = webView ?: return
        root.removeView(view)
        view.stopLoading()
        view.webChromeClient = null
        view.webViewClient = WebViewClient()
        view.removeAllViews()
        view.destroy()
        webView = null
        nativeBridge = null
    }

    private fun networkAvailable(): Boolean {
        val manager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = manager.activeNetwork ?: return false
        val capabilities = manager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun onMain(generation: Int, action: () -> Unit) {
        runOnUiThread {
            if (!isFinishing && !isDestroyed && generation == pairingGeneration) action()
        }
    }

    private fun enterTelevisionMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.apply {
                hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility =
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        }
    }

    private companion object {
        const val pairingPollMillis = 1_500L
        const val deviceCookie = "hearth_device"
    }
}

internal fun familyReachabilityMessage(message: String?): String? = message?.takeIf {
    val normalized = it.trim().lowercase()
    normalized.isNotEmpty() && normalized != "timeout" && !normalized.startsWith("net::")
}

private fun pairingErrorMessage(error: Throwable): String? =
    if (error is PairingClientException) error.message else null
