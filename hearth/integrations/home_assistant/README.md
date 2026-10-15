# Hearth for Home Assistant

Manual-install local custom integration for the Hearth bridge v1. It is not
built into Home Assistant or published through HACS. No MQTT broker is needed.
Installing or updating a live Home Assistant instance is a separate manual step.

Connect to the **Hearth server's** private HTTPS address, not the TV's IP address.
HA shows one household **Hearth server** device for data and chore actions, with
child **Hearth screen** devices for each approved display's tab selector. Server
data/actions work with the TV off. Display commands go through the server to an
already open screen. HA's separate Android TV integration still handles power
and launching the Hearth app; this bridge does not replace it.

1. With approval to change your HA instance, copy `custom_components/hearth/`
   into its configuration directory as `custom_components/hearth/`, then restart HA.
2. In HA **Settings → Devices & services → Add integration → Hearth**, enter only
   Hearth's private HTTPS origin. HA displays six uppercase letters and waits.
3. On the connected adult Hearth phone, open **Connections → Home Assistant**, enter those letters,
   then **Approve Home Assistant**. One approval includes all currently paired Hearth screens,
   calendar/chore information and completing/reopening today's chores; there are no permission boxes.
   HA completes automatically. No long key to type. HA must trust the certificate.
   The explicit HTTP exception accepts literal loopback IPs for local tests only.

Uses HA config-entry, `probatio` config-flow and coordinator APIs; imports,
config-flow/progress APIs and calendar values are checked with HA 2026.10.1.
Check the installed HA version before live installation: older-version compatibility is not
proved. Do not upgrade HA automatically; agree a compatibility fix or upgrade separately.
Protect HA's config entries/backups: they retain the automation key. Revoke it
in Hearth to stop access; HA requests reauthentication after a 401. Replacement
connections must identify the same household. Existing config entries remain compatible.
New short-code setup needs matching Hearth server migration 0031 and custom component 1.1.1.
Version 1.1.1 places the code in HA's progress-action translation; 1.1.0's waiting dialog hid it.
Component 1.1.2 matches the single-approval Hearth UI (D-111). Older restricted grants stay restricted
until an adult explicitly disconnects/reconnects. After revocation, use the existing Hearth entry's
reauthentication repair in HA rather than adding a duplicate entry. Newly paired screens need a
reconnect too; later devices or features are not silently granted.
Codes expire after five minutes; close/restart setup if expired. Approve only a setup you started.
No credentials belong in URLs or YAML.

The household has read-only open/completed chore counts (bounded items and
`truncated` on the open-count attributes) and a read-only calendar. Sharing disabled
or enabled-but-unavailable data makes the corresponding entities unavailable.
Calendar freshness stays `current`/`stale`/`offline`; offline and incomplete range
reads fail, rather than returning an empty calendar. All-day ends are exclusive.
With the single approval's chore control enabled, **Today's chores** is also an HA to-do list: tick/untick
today's existing chores. No add, remove, rename, reassignment, schedule or payment actions.
Completion changes affect earned pocket money normally. Locked/non-actionable chores are omitted;
failed, old-day or truncated data makes the list unavailable. Restricted existing grants retain
their exact permissions until an adult explicitly reconnects with the disclosed bundle. No TV needs to be on.

Large ranges use sequential requests of at most 31 elapsed days, with overlap
deduplication; aggregate limits are 744 days and 10,000 events (explicit errors).

Each approved screen is a child device with a **Visible tab** select. Automation
options use the shared wire IDs (`today`, `calendar`, `calendar_week`, etc.); the
UI translates labels. A ten-second poll observes the current tab. Navigation
waits up to 35 seconds for the exact applied acknowledgement, with no optimistic
state. The screen must already be visibly reporting Hearth. This integration has
no TV power, app-launch, media, general household-edit or adult-admin actions and
cannot bring Hearth over another app. App presence is not a power/media signal.

Offline checks (Python 3.12+; no network, credentials or HA instance required):

```sh
python3 -B -m unittest discover -s hearth/integrations/home_assistant/tests -v
```

Tests use a fake HTTP session and, for entity/config-flow wiring only, small HA
and schema import stand-ins. They do not establish full HA runtime, physical TV
or live install acceptance.
Patterns follow the official [coordinator](https://developers.home-assistant.io/docs/integration_fetching_data/),
[config flow](https://developers.home-assistant.io/docs/core/integration/config_flow/)
and [calendar](https://developers.home-assistant.io/docs/core/entity/calendar/) docs.
