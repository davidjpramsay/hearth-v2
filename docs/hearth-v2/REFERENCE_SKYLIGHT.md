# Public reference: Skylight Calendar feature class

Research date: 2026-08-03

Official public product page: <https://www.skylightframe.com/calendar/>

## Publicly described family outcomes

The official product material describes:

- combined calendars with Google, Outlook and Apple syncing
- an all-in-one display for events, chores, dinner plans and tasks
- a mobile app for planning away from the display
- interactive chores/routines
- star-powered rewards
- weekly meal planning and saved favourites
- grocery and arbitrary custom lists
- photo/screensaver behaviour
- an assistant that can derive events from emails, paper schedules and PDFs and suggest meal plans

These outcomes define a useful competitive baseline. They do not define Hearth's visual implementation.

## Hearth differentiation

Hearth should go beyond that baseline through:

- television-scale 4K landscape design
- complete D-pad operation without touch
- Home Assistant scenes, selected device state and presence-aware power
- local voice through Home Assistant Voice and iPhones
- deterministic, auditable voice commands before an LLM
- clean coexistence with the independent native Jellyfin Google TV app
- a separate Home Assistant/Music Assistant path for voice-requested Jellyfin
  music through Google Cast, without adding media controls to Hearth
- presence-aware power protection during native-app and Cast playback
- local Synology/Pi deployment and household data ownership
- graceful offline behaviour and cached schedule display
- explicit role/capability and audit models
- no mandatory subscription for household features

## Non-copying boundary

Do not use:

- Skylight trademarks as Hearth feature or screen names
- copied product copy, illustrations, icons or screenshots
- traced visual assets
- a pixel-level reproduction of its navigation, layouts or animations
- reverse-engineered private APIs or proprietary software

It is acceptable to study generic interaction problems such as family colour coding, chore completion feedback and calendar readability, then solve them in an original way consistent with `UX_SPEC.md`.
