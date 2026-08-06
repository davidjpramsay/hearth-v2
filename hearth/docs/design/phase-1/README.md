# Phase 1 design specification

Status: approved for implementation on 2026-08-03.

The concept images in `concepts/` are the visual source of truth for the first
Hearth television slice. They are design references only; application text,
controls, icons, status and layout remain native React/CSS UI.

## Concept inventory

| Concept           | Native composition   | Governs                                                                |
| ----------------- | -------------------- | ---------------------------------------------------------------------- |
| `today.png`       | 16:9 television      | App shell, rail, Today hierarchy, focus and summary bands              |
| `week.png`        | 16:9 television      | Seven-day time grid, event anatomy and week controls                   |
| `chores.png`      | 16:9 television      | Person groups, completion state and inline undo                        |
| `phone-today.png` | 390-pixel portrait   | Phone header, single-column flow and bottom navigation                 |
| `states.png`      | 16:9 component sheet | Loading, empty, stale, offline, pending, failure and permission states |

## Visible-copy lock

- Brand: `Hearth`
- Primary navigation: `Today`, `Week`, `Chores`, `Lists`, `Meals`, `Photos`,
  `Music`, `Home`
- Today: `Upcoming`, `Due now & today`, `Dinner`, `List summary`, `Notice`
- Week: `This week`, `3–9 August`, `Earlier week`, `Later week`
- Chores: `Chores`, `3 of 6 complete`, `Done — Undo`
- State language: use the exact family-readable phrases demonstrated in
  `states.png`; no raw provider or network error text is allowed.

Phase 1 may add only semantic or assistive text needed to make these controls
understandable. It must not add marketing copy, decorative pills, fake metrics
or extra product modules above the fold.

## Extracted design system

- Background: warm off-white `#f8f6f0`; surfaces `#fffefa`; primary text
  `#292f31`; muted text `#5f6667`; hairline `#ddd9d0`.
- Constructive/focus: eucalyptus `#3f7251`; calendar/navigation: sky
  `#1668b7`; attention: ochre `#c97900`; failures: restrained brick
  `#a83b31` used only beside an affected action.
- Typography: Source Sans 3 Variable, with a system sans-serif fallback.
  Television body and controls never fall below 28 logical pixels; supporting
  text never falls below 24 logical pixels.
- Geometry: 20-pixel row/panel radius at 1080p, one-pixel warm hairlines,
  restrained shadows, 48-pixel television-safe inset and 72-pixel minimum
  television target height.
- Focus: two-pixel eucalyptus/sky outline plus four-pixel outer halo, slight
  elevation and at most two-percent scale. Focus never relies on colour alone.
- Container model: open fields, rails, timeline ribbons and grouped rows.
  Avoid bento grids, nested cards and small dashboard widgets.
- Motion: 140–180 ms state transitions for focus/completion only; remove scale
  and non-essential movement when `prefers-reduced-motion` is active.

## Icon and asset inventory

- Navigation and status icons use one rounded, two-pixel outline family.
- Chevrons and arrows are SVG components rather than text glyphs.
- `public/brand/hearth-mark.png` is the transparent standalone sprig.
- `public/demo/ezra.png` and `public/demo/maya.png` are fictional generated
  demo portraits. They must never be represented as real household members.
- No colour overlay or gradient sits over portraits or the brand mark.

## Component families

- `TvRail` and `PhoneTabs`
- `ScreenHeader` and `ConnectivityStatus`
- `EventTimeline`, `EventRow` and `WeekEvent`
- `ChoreGroup`, `ChoreRow` and inline mutation status
- `SummaryBand`
- `StatusBanner`, `EmptyState`, `InlineError` and `PermissionMessage`

## Responsive continuation

- At 901 pixels and wider, use the television shell and explicit spatial focus
  graph.
- At 900 pixels and narrower, replace the rail with bottom navigation and use
  a phone-native single column.
- Phone Week becomes a date-grouped agenda; it never compresses seven columns.
- Phone Chores preserves the same completion/undo contract in a single list.

## Fidelity checks

The final comparison must inspect copy, composition, type scale, palette,
icon/asset treatment, spacing/container model, focus and responsive behaviour.
Implementation screenshots and the resulting fidelity ledger are retained in
`../evidence/phase-1/`.
