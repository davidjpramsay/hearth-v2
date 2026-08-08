# Phase 4 planning concepts

> Historical reference: the former ochre-star reward concept was superseded by the pocket-money concept and D-027 on 2026-08-06. It is not an active product requirement or shipped interface.

These original concepts are the visual source of truth for the household
planning slice:

- `concepts/lists-tv.png` — television list selection, completion and focus
- `concepts/meals-tv.png` — tonight summary, seven-day dinner strip and phone handoff
- `concepts/admin-phone.png` — phone-first routine, meal and reward administration
- `concepts/lists-phone.png` — single-column list completion and item addition

They extend the existing Hearth visual system with eucalyptus list actions,
warm dinner surfaces and ochre stars. They are reference material only. React
and CSS render the product; no concept screenshot is embedded in the interface.

The implementation deliberately keeps clear-checked deletion out of this
slice, uses the established shared phone header/navigation rather than
simulated iOS chrome, and splits the dense three-panel Admin concept into
scrollable Family Planning routes.
