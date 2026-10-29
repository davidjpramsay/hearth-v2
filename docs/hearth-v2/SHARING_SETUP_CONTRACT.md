# Shareable private setup — D-127

Hearth is useful without Home Assistant. A fresh installation needs Docker Compose, Python 3,
an x86-64 Linux/POSIX host for the currently published images, and an already trusted private HTTPS reverse
proxy. No router, DNS, certificate, firewall, HA or existing Synology configuration is changed
by the installer. Native Wi-Fi/Bluetooth provisioning remains future work.

## Installer and private first phone

The guided installer selects only a successful main Verify Hearth run whose verified image
publication completed. It pins both images to that full commit, checks both image revision labels,
and requires that commit's supported setup-format marker; older releases without the QR tool
cannot be selected. Installer format 1 freezes its generated Compose template. Future template
changes need a versioned compatibility path, rather than adopting an edited file automatically.
It creates a new private installation directory outside source control. Existing paths, symlinks,
running households and other Compose projects are never adopted or overwritten. It creates fresh
data/secrets directories and a CSPRNG 256-bit first-use proof, never copying the operator's data.
The web port binds only to loopback. Run commands as argument arrays; never interpolate shell text.
The QR image is published atomically only after a complete private write, without replacing an
existing card. Interruption never publishes a partial PNG. First claim consumes/removes its key;
resume/update never requires or recreates that consumed proof.

After pull/configuration, explicit local confirmation starts that new project. A container-local
CLI converts the protected first-use file to a private PNG setup card; no network endpoint serves
it. The card contains the existing purpose-specific setup fragment and no new authority. Do not
print the proof/link, use an external QR service, or put it in a Git artifact. The installer requires
normal trusted-certificate HTTPS readiness before reporting phone setup ready. A failed readiness
check leaves the new installation available for an explicit resume; it never clears data, invents
success, exposes an HTTP owner flow or changes network policy. This is server installation, not
an assertion of physical phone/TV commissioning.

## Explicit portable updates

For this installer’s exact recorded project only, --update selects a verified forward main release,
asks for maintenance consent, pulls and checks both images before stopping, and retains a full
stopped data/photo/secret checkpoint with SQLite integrity checked. Failed readiness restores the
matching checkpoint and pinned images; failed migrated state is retained privately. Updates are
serialized and refuse changed Compose files or symlink data. Interrupted power/rollback recovery
remains an operator task. This installs no privileged portable phone-update agent and never adopts
the existing commissioned Synology deployment.

## Guided owner setup and connections

Only a successful initial owner claim leads to `/admin/get-started`; existing-owner replacement
keeps its deliberate recovery destination. Get started is a core adult route protected by the
existing admin/shared-screen boundary. It links to existing household/people, Modules, Phones &
screens, recovery and optional Connections flows. Ready/empty/error/loading states derive from
real existing read models, not browser completion flags. Opening guidance never writes household
settings, creates a grant, reads HA directly or requires an external connection. Adults can open
Today immediately and return through Hearth settings. There is no new database or access scope.

Connections groups independent calendar/weather/photo setup and optional HA. An unavailable
connection must not replace the whole menu with an error. Off modules offer Modules rather than
calling disabled feature endpoints. Clear setup/not connected/connected/check states are distinct.
HA's six-letter inbound connection is separate from selected indoor sensors and the optional
outbound safety/script controls. New installs are not forced through those token/mapping forms.

## Distributable HA component

The web build bundles a deterministic, credential-free ZIP of the exact matching HA component,
an install/update helper and short instructions. The helper validates the fixed manifest/file
allowlist, installs only `custom_components/hearth` into an explicitly chosen HA config directory,
refuses symlink destinations and keeps a private rollback copy before replacing existing files.
It never reads `.storage`, tokens, household configuration or automations and does not restart HA.
HA restart and six-letter adult approval remain explicit. No MQTT/Node-RED, public credential,
automatic permission expansion, HACS publication or built-in HA discovery is implied.

## Verification and boundaries

Test installer pinning, refusal/permissions, readiness failure/resume and exact container commands
with disposable fixtures. Test HA install/update, rollback, malformed ZIP, traversal and symlink
refusals. Verify fresh-owner/recovery routing, optional-provider failures, off modules, mobile/TV
layout, keyboard/Back and shared-screen denial. Keep existing release checks. Factory hardware,
actual fresh-server installation, actual camera scan, HA restart/pairing, live deployment and
consumer automatic updates are separate acceptance, never inferred from fixtures/browser proof.
