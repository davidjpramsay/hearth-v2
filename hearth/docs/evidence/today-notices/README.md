# Today settings preview evidence

The Today settings preview was rendered with Playwright Chromium because the Build Web Apps
Browser/IAB controller is not exposed in this workspace. The accepted visual references remain:

- `docs/design/phase-1/concepts/today.png`
- `docs/design/phase-1/concepts/phone-today.png`

Both concepts and the latest 390×844 settings renders were inspected directly with `view_image`.
The previews use current typed Today data and the authoritative post-concept product boundaries; they
are not screenshots embedded in the interface.

## Fidelity ledger

| Area            | Finding                                                                                                                                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Copy            | Miniature content uses the real household time, date, weather, event, chore, meal, list and notice strings. Only `Preview`, its one-line purpose and the functional `TV`/`Phone` choices are new.                      |
| Composition     | TV preserves the accepted two-column plans/chores structure and optional summary/photo row. Phone becomes the accepted single-column hierarchy instead of squeezing the TV layout.                                     |
| Typography      | Existing local Source Sans 3 hierarchy is retained; miniature labels remain legible without competing with the surrounding settings controls.                                                                          |
| Palette         | Warm ivory, surface, eucalyptus, sky, ochre and member/event colours come from existing Hearth tokens and data. No new gradient or decorative colour system was introduced.                                            |
| Icons/assets    | Existing local SVG icons and the same safe current household avatar/photo URLs are reused. No concept image is shipped as UI.                                                                                          |
| Container model | The preview sits inside the existing open Today overview settings card, separated by one hairline; it does not introduce a dashboard card grid or layout editor.                                                       |
| Focus           | TV/Phone are ordinary labelled buttons with selected state, visible focus treatment and left/right D-pad links. The preview itself is one concise accessible image description rather than duplicated child semantics. |
| Responsive      | The 16:9 TV preview scales inside a 390-pixel companion screen; the 390:844 phone preview remains centred, complete and free of horizontal overflow.                                                                   |
| States          | Loading and unavailable preview reads are explicit while section switches remain usable. Rapid multi-switch updates are optimistic and serialised.                                                                     |

The above-the-fold copy audit found no renamed or reordered existing settings copy. The three new
labels are required controls for the audit-requested preview. No fixable composition, typography,
palette, asset, focus or phone-overflow mismatch remained in the final inspected renders.

## Retained renders

- `today-preview-tv-phone-portrait.png`
- `today-preview-phone-phone-portrait.png`
- `today-preview-dark-phone-portrait.png`
- `today-notices-phone-portrait.png`
- `today-customised-tv-1080.png`

## Interaction proof

`tests/e2e/today-settings.spec.ts` loads Today & notices, observes real preview data, switches TV to
Phone, rapidly disables Dinner and Family photo, proves that both remain disabled, publishes a
notice and verifies the resulting television Today view. The same suite retains both preview renders
and runs serious/critical axe checks in light and dark modes.

## Verification

- `pnpm lint` — passed with zero warnings.
- `pnpm typecheck` — passed across shared, core, server and web.
- `pnpm --filter @hearth/web test:unit` — 18 files and 53 tests passed.
- `pnpm exec playwright test tests/e2e/today-settings.spec.ts` — 4 tests passed.
- `pnpm verify` — formatting, lint, type checking, 124 unit tests, 86 server integration tests,
  18 migration tests, web/server production builds and 199 Playwright tests all passed. The browser
  run completed in 5.1 minutes.
