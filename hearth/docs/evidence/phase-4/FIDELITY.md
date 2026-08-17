# Phase 4 fidelity ledger

Accepted visual references:

- `docs/design/phase-4/concepts/lists-tv.png`
- `docs/design/phase-4/concepts/meals-tv.png`
- `docs/design/phase-4/concepts/admin-phone.png`
- `docs/design/phase-4/concepts/lists-phone.png`

Every reference and its latest 4K, 1080p, 1366, phone portrait, phone landscape
or Admin counterpart was inspected with `view_image`.

| Area              | Concept-to-render finding                                                                                                          | Resolution                                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Copy              | Groceries, six remaining items, the dinner week and family favourites preserve the approved household language.                    | The historical star copy is superseded by pocket money; list management uses direct family-readable verbs.                                                    |
| Composition       | TV Lists retains a selector plus dominant list; Meals retains Tonight, seven days and two broad actions.                           | Both meal actions now reach the separate Admin route. Its compact week keeps seven dinner fields together and expands saved-meal/note details per night.      |
| Typography        | Local Source Sans 3 preserves the large TV hierarchy and compact phone labels.                                                     | 1366 wraps long dinner names without truncation; actionable text remains above the TV minimum.                                                                |
| Palette           | Warm ivory, eucalyptus, terracotta, plum and eight curated list colours match the established original Hearth tokens.              | Light and dark list-management surfaces retain clear selected, destructive and confirmation states.                                                           |
| Icons/assets      | Lists, meals, avatars and navigation use local assets and direct Lucide imports.                                                   | No concept image, provider art or copied commercial asset is shipped.                                                                                         |
| Spacing/container | 1080p and 4K preserve the logical safe area and calm open canvas.                                                                  | Compact 1366 permits focus-scrolled overflow rather than shrinking list rows below the 72 px target.                                                          |
| Focus             | Initial TV focus lands on Milk or Monday dinner with outline, colour, geometry and elevation.                                      | Arrow navigation, completion/undo, Meals transition and Back restoration pass in Playwright. Phone entry focus no longer shifts the short landscape viewport. |
| Responsive        | Phone Lists becomes a horizontal chooser over one column; Meals keeps a concise family view and exposes a clear Manage meals link. | The Admin week is materially shorter than seven fully expanded three-field rows; the stable Today/Calendar/Chores/More tabs remain available while scrolling. |
| States            | Empty, cached offline and mutation rollback remain intentional and retain the family’s local data.                                 | Failure restores Milk or retries the same list/meal request ID; meal copy, clear and archive actions require explicit confirmation and remain recoverable.    |

Intentional deviations are product decisions: phone chrome is not imitated,
the concept's listening buttons are absent because Home Assistant owns voice,
and the historical reward panel is replaced by pocket money. Clear checked is
implemented as recoverable database soft archive behind an adult confirmation.
The latest TV, 1366, phone portrait, phone landscape and full-page list/meal
Admin captures were inspected. The initial meal Admin render exposed an unnecessarily long stack of
three visible controls per day; the settled render keeps the primary seven dinner fields visible and
collapses optional details. No fixable Phase 4 layout mismatch remained.
