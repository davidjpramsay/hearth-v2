# Phase 4 fidelity ledger

Accepted visual references:

- `docs/design/phase-4/concepts/lists-tv.png`
- `docs/design/phase-4/concepts/meals-tv.png`
- `docs/design/phase-4/concepts/admin-phone.png`
- `docs/design/phase-4/concepts/lists-phone.png`

Every reference and its latest 4K, 1080p, 1366, phone portrait, phone landscape
or Admin counterpart was inspected with `view_image`.

| Area              | Concept-to-render finding                                                                                                       | Resolution                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Copy              | Groceries, six remaining items, the dinner week, family favourites and star history preserve the approved household language.   | Technical command detail is limited to the small demo-voice explanation; normal actions remain family-readable. |
| Composition       | TV Lists retains a selector plus dominant list; Meals retains Tonight, seven days and two broad actions.                        | Admin uses separate scrollable phone routes so dense forms never enter the TV path.                             |
| Typography        | Local Source Sans 3 preserves the large TV hierarchy and compact phone labels.                                                  | 1366 wraps long dinner names without truncation; actionable text remains above the TV minimum.                  |
| Palette           | Warm ivory, eucalyptus, terracotta, plum and ochre stars match the established original Hearth tokens.                          | Reward settled-copy contrast was darkened after axe measured 4.4:1.                                             |
| Icons/assets      | Lists, meals, stars, avatars and navigation use local assets and the existing Hearth mark.                                      | No concept image, provider art or copied commercial asset is shipped.                                           |
| Spacing/container | 1080p and 4K preserve the logical safe area and calm open canvas.                                                               | Compact 1366 permits focus-scrolled overflow rather than shrinking list rows below the 72 px target.            |
| Focus             | Initial TV focus lands on Milk or Monday dinner with outline, colour, geometry and elevation.                                   | Arrow navigation, completion/undo, Meals transition and Back restoration pass in Playwright.                    |
| Responsive        | Phone Lists becomes a horizontal chooser over one column; Meals reveals the detailed editor; planning pages stay single-column. | Stable Today/Week/Chores/More tabs remain visible, and More is active for Lists, Meals and Admin routes.        |
| States            | Empty, cached offline and mutation rollback remain intentional and retain the family’s local data.                              | Failure restores Milk, preserves focus, shows Try again and succeeds on the next command.                       |

Intentional deviations are product decisions: clear-checked bulk deletion is
deferred, phone chrome is not imitated, and the Admin concept’s three examples
are full routes rather than compressed panels. No fixable mismatch remained
after the routine-open-state and contrast corrections.
