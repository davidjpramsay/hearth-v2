# Pocket-money fidelity ledger

## Sources inspected

- Accepted concept: `docs/design/pocket-money/concepts/pocket-money-tv-phone.png`
- Latest television counterpart: `screenshots/chores-pocket-money-tv-1080.png`
- Latest companion counterparts: `screenshots/admin-pocket-money-phone-portrait.png` and
  `screenshots/admin-pocket-money-phone-landscape.png`
- Correction counterparts: `screenshots/admin-pocket-money-correction-phone-portrait.png` and
  `screenshots/admin-pocket-money-voided-phone-portrait.png`

The renders were captured with the installed Playwright Chromium fallback because this toolset did
not expose a Browser/IAB controller. The accepted concept and every counterpart above were inspected
at original resolution with `view_image`.

## Ledger

| Area                 | Fidelity finding                                                                                                                          | Intentional extension or action                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Copy                 | “Pocket money”, weekly progress, amount due and payday remain direct and family-readable.                                                 | Added explicit payment records, remaining amount, early-payment warning, optional note and correction language required by D-035. |
| Composition          | Chores preserves the concept's large child columns and compact money band. Phone remains a calm single-column administration flow.        | Week controls lead the screen; immutable history follows setup/payment rather than competing with the weekly summary.             |
| Typography           | Source Sans 3 hierarchy, large child percentage, compact labels and strong currency figures match Hearth's established scale.             | History metadata is deliberately quieter, while correction reasons remain readable rather than becoming tiny ledger text.         |
| Palette              | Warm paper, eucalyptus progress, plum actions and blue focus remain aligned with the concept in light and dark themes.                    | Amber is reserved for missing setup and terracotta for a voided record; neither replaces member colours.                          |
| Icons/assets         | Existing local avatars and direct calendar/wallet/warning icons are retained.                                                             | No star, prize, reward-catalogue or third-party asset remains in the active surface.                                              |
| Spacing/container    | Cards use the same rounded container model and generous phone insets. Currency fields retain a visible, non-overlapping prefix.           | Four compact summary cells replace the earlier three-cell card so earned, paid and weekly totals are distinguishable.             |
| Focus/interaction    | Existing keyboard focus treatment applies to buttons and form controls; payment and correction actions are ordinary reachable controls.   | Correction is a reason form, never an edit/delete affordance. Reduced-motion users are not forced through smooth scrolling.       |
| Responsive behaviour | The TV Chores board stays within the primary viewport; phone portrait and landscape remain one readable flow without horizontal overflow. | Historical weeks switch settings to an honest read-only summary and direct adults back to This week for changes.                  |

## Copy diff and sign-off

The accepted concept's “Record paid” action assumed one payment. It is intentionally replaced by
“Record payment”, an editable partial amount and a separate immutable history/correction flow. The
concept's visual hierarchy and child-first Chores emphasis are retained; the new administration
content is a product-contract extension rather than a redesign.

No fixable mismatch remained after correcting the obscured payment-field digit and compacting the
optional-note label. The latest portrait, landscape, correction, voided and 1080p TV renders are
approved as the current D-035 fidelity baseline.
