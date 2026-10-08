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

/** Native display metrics, not the default mobile viewport, own TV layout. */
internal fun tvViewportScript(initialScalePercent: Int): String {
    val scale = initialScalePercent.coerceIn(25, 100) / 100.0
    return """
        (() => {
          if (window !== window.top) return;
          const content = 'width=1920, height=1080, initial-scale=$scale, minimum-scale=$scale, maximum-scale=$scale, user-scalable=no, viewport-fit=cover';
          const apply = () => {
            const root = document.documentElement;
            if (!root) return;
            root.dataset.hearthTv = 'true';
            root.dataset.hearthTvNative = 'true';
            if (!document.head) return;
            let viewport = document.querySelector('meta[name="viewport"]');
            if (!viewport) {
              viewport = document.createElement('meta');
              viewport.name = 'viewport';
              document.head.appendChild(viewport);
            }
            if (viewport.content !== content) viewport.content = content;
          };
          apply();
          if (document.readyState === 'loading') {
            const observer = new MutationObserver(apply);
            observer.observe(document, { childList: true, subtree: true });
            document.addEventListener('DOMContentLoaded', () => {
              apply();
              observer.disconnect();
            }, { once: true });
          }
        })();
    """.trimIndent()
}
