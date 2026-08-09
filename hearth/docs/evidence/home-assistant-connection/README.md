# Home Assistant connection evidence

Captured with the repository Playwright Chromium fallback because no Browser/IAB controller is
available in this toolset. Every run resets the isolated fictional demo repositories; no live Home
Assistant address, token, entity or household action is used.

## Retained views

- `home-assistant-setup-phone-portrait.png` — first viewport at 390×844
- `home-assistant-setup-phone-landscape.png` — first viewport at 844×390
- `home-assistant-mapping-phone-portrait.png` — tested-instance and mapping entry at 390×844
- `home-assistant-mapping-actions-phone-portrait.png` — lower mapping choices and save action
- `home-assistant-connected-phone-portrait.png` — safe connected summary
- `home-assistant-connected-actions-phone-portrait.png` — saved labels and replace/remove actions

The split long-page captures are intentional. They retain real viewport geometry and fixed bottom
navigation instead of using a full-page composite that can make fixed controls appear to overlap
content.

## Fidelity ledger

| Area                 | Result                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Copy and ownership   | “Strictly limited” states that Home Assistant owns voice/devices/automation; Hearth names only four safety signals and three actions. Demo copy is explicit.                               |
| Composition          | Reuses the accepted phone Admin header, narrow content column, privacy callout, grouped form cards and stable four-tab navigation from `docs/design/phase-2/concepts/admin-phone.png`.     |
| Typography           | Local Source Sans 3 hierarchy remains readable at both phone orientations; labels and help text do not rely on placeholder text.                                                           |
| Palette              | Existing canvas, surface, eucalyptus, aubergine and semantic success colours are used; no integration-brand imitation was introduced.                                                      |
| Icons/assets         | Existing local shield, home, check and navigation SVG icons only; no Home Assistant artwork or remote asset is bundled.                                                                    |
| Spacing and controls | Inputs/buttons retain phone-sized targets, mapping rows remain separated, and the destructive removal action is visually distinct and confirmed.                                           |
| Responsive behaviour | 390×844 presents one calm column; 844×390 preserves the same hierarchy and uses normal scrolling rather than compressing mapping controls.                                                 |
| Focus and Back       | Entry focuses the root-address field, keyboard Back returns to Connections and restores the Home Assistant row, and native selects remain keyboard-operable.                               |
| Privacy              | The token input disappears after test. Tested and saved views show hostname, instance/version and friendly labels only—never the token, root URL or raw entity IDs.                        |
| Accessibility        | Axe reports no serious or critical issue for the route or the populated mapping state. Labels, fieldsets, status text and confirmation grouping expose their meaning without colour alone. |

## Automated coverage

`tests/e2e/admin.spec.ts` covers test, mapping, save, restart persistence, removal, secret absence,
family-safe authentication error, keyboard Back, focus restoration, responsive captures and
serious/critical accessibility checks. Server/shared suites cover private URL validation, opaque
discovery, ten-minute pending tests, authorisation, idempotency, audits, external mode-`0600`
storage, safe SQLite metadata, strict migration checks, REST allowlisting and secret-safe failures.
