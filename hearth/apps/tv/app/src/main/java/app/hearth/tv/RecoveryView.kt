package app.hearth.tv

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView

class RecoveryView(context: Context) : FrameLayout(context) {
    init {
        setBackgroundColor(color(R.color.hearth_canvas))
        isFocusable = true
    }

    fun showServerEntry(
        initialOrigin: String,
        error: String? = null,
        onConnect: (String) -> Unit,
    ) {
        val input = EditText(context).apply {
            setText(initialOrigin)
            hint = context.getString(R.string.server_address)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setTextColor(color(R.color.hearth_charcoal))
            setHintTextColor(color(R.color.hearth_muted))
            textSize = 22f
            isSingleLine = true
            setPadding(dp(22), dp(16), dp(22), dp(16))
            background = rounded(Color.WHITE, dp(12).toFloat(), color(R.color.hearth_sky_soft), dp(2))
            setOnFocusChangeListener { view, focused ->
                background = rounded(
                    Color.WHITE,
                    dp(12).toFloat(),
                    color(if (focused) R.color.hearth_sky else R.color.hearth_sky_soft),
                    dp(if (focused) 4 else 2),
                )
                animateFocus(view, focused, 1.015f)
            }
            layoutParams = LinearLayout.LayoutParams(dp(680), dp(70)).apply {
                topMargin = dp(28)
            }
        }
        val primary = actionButton(context.getString(R.string.connect_action)) {
            onConnect(input.text.toString())
        }
        render(
            title = context.getString(R.string.connect_title),
            message = error ?: context.getString(R.string.connect_message),
            messageIsError = error != null,
            customView = input,
            primary = primary,
        )
        primary.requestFocusAfterLayout()
    }

    fun showConnecting(message: String) {
        render(title = context.getString(R.string.app_name), message = message)
    }

    fun showPairing(code: String, onNewCode: () -> Unit, onChangeAddress: () -> Unit) {
        val codeView = TextView(context).apply {
            text = code.chunked(3).joinToString("  ")
            setTextColor(color(R.color.hearth_charcoal))
            textSize = 58f
            typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
            letterSpacing = 0.08f
            gravity = Gravity.CENTER
            setPadding(0, dp(22), 0, dp(6))
        }
        val primary = actionButton(context.getString(R.string.try_again), onNewCode)
        val secondary = secondaryButton(context.getString(R.string.change_address), onChangeAddress)
        render(
            title = context.getString(R.string.pairing_title),
            message = context.getString(R.string.pairing_message),
            customView = codeView,
            status = context.getString(R.string.pairing_waiting),
            primary = primary,
            secondary = secondary,
        )
        primary.requestFocusAfterLayout()
    }

    fun showOffline(message: String?, onRetry: () -> Unit, onChangeAddress: () -> Unit) {
        val primary = actionButton(context.getString(R.string.try_again), onRetry)
        val secondary = secondaryButton(context.getString(R.string.change_address), onChangeAddress)
        render(
            title = context.getString(R.string.offline_title),
            message = message?.takeIf(String::isNotBlank) ?: context.getString(R.string.offline_message),
            primary = primary,
            secondary = secondary,
        )
        primary.requestFocusAfterLayout()
    }

    fun showRevoked(onPairAgain: () -> Unit) {
        val primary = actionButton(context.getString(R.string.connect_action), onPairAgain)
        render(
            title = context.getString(R.string.revoked_title),
            message = context.getString(R.string.revoked_message),
            primary = primary,
        )
        primary.requestFocusAfterLayout()
    }

    fun showWebViewUpdate() {
        render(
            title = context.getString(R.string.webview_update_title),
            message = context.getString(R.string.webview_update_message),
        )
    }

    private fun render(
        title: String,
        message: String,
        messageIsError: Boolean = false,
        customView: View? = null,
        status: String? = null,
        primary: Button? = null,
        secondary: Button? = null,
    ) {
        removeAllViews()
        val card = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(64), dp(48), dp(64), dp(48))
            background = rounded(color(R.color.hearth_surface), dp(24).toFloat())
            elevation = dp(14).toFloat()
        }
        val brand = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            addView(ImageView(context).apply {
                setImageResource(R.drawable.hearth_mark)
                contentDescription = null
            }, LinearLayout.LayoutParams(dp(52), dp(52)))
            addView(TextView(context).apply {
                text = context.getString(R.string.app_name)
                setTextColor(color(R.color.hearth_charcoal))
                textSize = 30f
                typeface = Typeface.DEFAULT_BOLD
            }, LinearLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                marginStart = dp(16)
            })
        }
        card.addView(brand)
        card.addView(TextView(context).apply {
            text = title
            setTextColor(color(R.color.hearth_charcoal))
            textSize = 42f
            gravity = Gravity.CENTER
            typeface = Typeface.DEFAULT_BOLD
        }, LinearLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(32)
        })
        card.addView(TextView(context).apply {
            text = message
            setTextColor(if (messageIsError) Color.rgb(164, 61, 49) else color(R.color.hearth_muted))
            textSize = 22f
            gravity = Gravity.CENTER
            maxWidth = dp(760)
        }, LinearLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(14)
        })
        customView?.let(card::addView)
        status?.let {
            card.addView(TextView(context).apply {
                text = it
                setTextColor(color(R.color.hearth_eucalyptus))
                textSize = 20f
                gravity = Gravity.CENTER
            }, LinearLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                topMargin = dp(18)
            })
        }
        if (primary != null || secondary != null) {
            card.addView(LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER
                primary?.let { addView(it) }
                secondary?.let { addView(it) }
            }, LinearLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                topMargin = dp(32)
            })
        }
        addView(card, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT, Gravity.CENTER))
        visibility = VISIBLE
    }

    private fun actionButton(label: String, action: () -> Unit): Button = button(label, false, action)

    private fun secondaryButton(label: String, action: () -> Unit): Button = button(label, true, action)

    private fun button(label: String, secondary: Boolean, action: () -> Unit): Button =
        Button(context).apply {
            text = label
            isAllCaps = false
            textSize = 21f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(if (secondary) color(R.color.hearth_charcoal) else Color.WHITE)
            backgroundTintList = ColorStateList(
                arrayOf(intArrayOf(android.R.attr.state_focused), intArrayOf()),
                intArrayOf(
                    color(R.color.hearth_sky),
                    if (secondary) color(R.color.hearth_sky_soft) else color(R.color.hearth_eucalyptus),
                ),
            )
            minWidth = dp(220)
            minHeight = dp(68)
            setPadding(dp(28), dp(12), dp(28), dp(12))
            setOnClickListener { action() }
            setOnFocusChangeListener { view, focused -> animateFocus(view, focused, 1.05f) }
            layoutParams = LinearLayout.LayoutParams(LayoutParams.WRAP_CONTENT, dp(68)).apply {
                marginStart = dp(8)
                marginEnd = dp(8)
            }
        }

    private fun Button.requestFocusAfterLayout() = post { requestFocus() }

    private fun animateFocus(view: View, focused: Boolean, focusedScale: Float) {
        view.elevation = dp(if (focused) 12 else 2).toFloat()
        view.animate()
            .scaleX(if (focused) focusedScale else 1f)
            .scaleY(if (focused) focusedScale else 1f)
            .setDuration(120)
            .start()
    }

    private fun rounded(
        fill: Int,
        radius: Float,
        stroke: Int? = null,
        strokeWidth: Int = 0,
    ): GradientDrawable = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        setColor(fill)
        cornerRadius = radius
        if (stroke != null) setStroke(strokeWidth, stroke)
    }

    private fun color(resource: Int): Int = context.getColor(resource)

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
