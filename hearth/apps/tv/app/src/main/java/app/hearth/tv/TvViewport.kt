package app.hearth.tv

import kotlin.math.min
import kotlin.math.roundToInt

private const val logicalWidth = 1920f
private const val logicalHeight = 1080f

internal fun tvInitialScalePercent(
    widthPixels: Int,
    heightPixels: Int,
    density: Float,
): Int {
    if (widthPixels <= 0 || heightPixels <= 0 || density <= 0f) return 100
    val cssWidth = widthPixels / density
    val cssHeight = heightPixels / density
    return (min(cssWidth / logicalWidth, cssHeight / logicalHeight) * 100f)
        .roundToInt()
        .coerceIn(25, 100)
}
