# Phase 7 Photos evidence

The Photos screen was inspected interactively with the in-app Browser and rendered systematically
with Playwright Chromium. Retained screenshots
cover 3840×2160, 1920×1080, 1366×768, 390×844 and 844×390, plus empty,
unavailable, failure, selected-portrait, automatically advanced portrait, ambient and phone Admin
index/curation states. Curation evidence covers visible controls, a focused hidden-photo Restore
action and dark phone landscape. `screenshots/photos-auto-portrait-tv-1080.png` proves that the timer changes both the
featured occupant and the orientation-aware composition without a click. Managed phone uploads are
tested with generated portrait content, deduplication and path-free persistence; the optional folder
adapter is tested with generated landscape/portrait inputs rather than treating a live NAS folder as
the only production path.

## Fidelity ledger

| Area         | Concept-to-product finding                                                                                                                                                                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Copy         | `Family photos`, `Photos` and `Start ambient` are retained. The product truthfully says five favourites, names the source and explains automatic 45-second rotation.                                                                                                          |
| Composition  | A large feature plus four substantial support positions retains the concept hierarchy without duplicated images, skinny columns or shallow ribbons. Each advance changes the feature and reflows by orientation.                                                              |
| Typography   | Existing local Source Sans 3 and Hearth header hierarchy are retained; actions and automatic/pause state remain sofa-readable.                                                                                                                                                |
| Palette      | Existing warm ivory, eucalyptus and sky focus colours are unchanged.                                                                                                                                                                                                          |
| Icons/assets | Local SVG icons and separate original fictional WebP photos are used. The UI concept itself is not shipped.                                                                                                                                                                   |
| Orientation  | `cover` fills intentional collage geometry without stretching; portrait features become tall anchors, landscape features become wide anchors, and ambient keeps the complete image against a neutral field.                                                                   |
| Focus        | Selected state uses eucalyptus; keyboard/D-pad focus adds sky outline, halo, elevation and geometry. Pause, ambient and every visible photo remain remote reachable.                                                                                                          |
| Responsive   | Phone portrait uses the same useful feature/support hierarchy; phone landscape intentionally retains three substantial rotating occupants instead of compressing all five.                                                                                                    |
| States       | Loading, empty, stale/unavailable, offline cache, request failure/retry and corrupt-image fallback use family-readable copy without source paths. Admin reports managed/import counts, upload results, optional folder status and persistent favourite/hide/restore controls. |

No fixable composition, focus, orientation, copy or responsive mismatch remained in the final
inspected renders. Automatic rotation now shows a subtle progress line, pauses for reduced motion
and hidden documents, can be paused manually and resets its calm 45-second interval after a manual
selection. Adult curation uses the existing card, icon, focus and inline-confirmation language; the
deliberate remaining difference is the five-photo demo count until the approved live folder is
commissioned.

## Verification on 2026-08-10

`pnpm verify` passed from `hearth/`: formatting, lint, strict type checking, 117 unit tests, 86
API/integration tests, 18 migration tests, web and server production builds, and 197 Playwright
Chromium tests. The browser suite includes remote-only navigation, automatic and reduced-motion
rotation, adult favourite/hide/restore commands, focus restoration, offline cached content,
failure/corrupt-image handling, dark mode, responsive captures and automated accessibility checks.
`git diff --check` also passed.

## Display optimisation verification on 2026-08-17

The current `pnpm verify` gate passed formatting, lint, strict type checking, 134 unit tests, 92
API/integration tests, 19 migration tests, web/server production builds and all 210 Playwright
Chromium flows. `pnpm verify:tv` also passed Android unit tests, debug/release lint and debug plus
minified release APK assembly. The in-app browser path inspected Photos at 3840×2160, 1920×1080 and
390×844 with no horizontal overflow, browser warnings or errors. The 4K browser viewport filled the
surface with computed `zoom: 2` and `transform: none`; ambient requested the full display asset at
high priority and retained `object-fit: contain`. Fresh 4K, 1080p and phone captures were inspected
at original resolution. No live Synology deployment or television state changed during this check.

## Managed-upload verification on 2026-08-20

The in-app Browser inspected the authenticated phone administration path from **Photos → Choose
photos** through upload success and curation at 390×844. The accessibility tree exposed one
intentional upload action, with no duplicate native file control or horizontal overflow. The final
`pnpm verify` gate passed formatting, lint, strict type checking, 145 unit tests, 98
API/integration tests, 22 migration checks, web/server production builds and all 221 Playwright
Chromium flows. The suite covers direct upload, deduplication, EXIF orientation normalization,
portrait derivatives, favourite/hide/restore commands, the optional folder-import outage boundary,
offline cache, keyboard/D-pad focus, responsive screenshots and automated accessibility checks.
`git diff --check` also passed.
