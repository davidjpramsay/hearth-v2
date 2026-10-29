# Install a private Hearth

Hearth runs without Home Assistant. Chores, reminders, routines, lists, meals and phone photo
uploads are built in. Calendar, outdoor weather, Bible verse, NBA and HA are optional connections.

1. On an x86-64 server, install Docker with Compose and Python 3. Publish the server only through
   an already trusted **private HTTPS** reverse proxy. No public port forwarding. The default
   proxy destination is `http://127.0.0.1:8432`; use the server’s loopback, not your phone’s.
2. Download/unzip **Hearth server setup** from Hearth’s Connections page or the verified build’s
   downloads. Run `python3 install.py`. Choose a new private folder outside any Git checkout,
   enter the trusted HTTPS address, then confirm. The installer chooses a fully verified published
   release, creates fresh protected storage and starts its two containers. It never imports someone
   else’s household, secrets or configuration. Root operators must supply a non-root service UID/GID.
3. Open `data/first-phone.png` privately on your computer (copy that one file through your normal
   secure server administration connection if headless). Scan with your phone camera. Name your
   home and follow **Get started**. Remove the initial PNG after claiming; it is not a recovery card.

The installer cannot create a trusted certificate, configure your reverse proxy or join Wi-Fi.
It changes no router, DNS, firewall, existing Synology installation or HA automation. A failed
readiness check is not a successful install. Fix the private proxy/certificate, then use
`python3 install.py --directory /your/new/hearth --resume`; this preserves data and first-use proof.
Do not rerun fresh setup against an existing installation or reuse another household’s setup card.

Use **Hearth settings → Get started** for people, modules, screens and lost-phone protection.
**Connections** explains each optional service. No HA, MQTT, cloud account or LLM is required for
local household features. Core use survives internet outages; external feeds need connectivity.

## Updates and recovery

For this installer’s installations, run `python3 install.py --directory /your/hearth --update`.
Confirm the proposed verified forward release. The updater pulls/checks both images before the
brief stop, checkpoints **all** data/photos/secrets while stopped, checks SQLite integrity and
retains the previous pinned configuration. Failed readiness restores that matching checkpoint,
not an old image against migrated data. The failed state remains private for diagnosis. Avoid
editing during the update and keep free space for the complete checkpoint. Recovery after a
power loss or an interrupted rollback may require the retained checkpoint and operator help.

Existing commissioned Synology installations keep their protected in-app update/rollback helper;
do not move them into this installer. Portable updates currently run from this explicit command,
not a privileged phone-update agent. Phone-triggered portable updates and ARM images remain
separate work. SQLite’s routine internal backups do not include photos or provider secret files;
protect the complete private installation with your normal off-device backup.

No personal puzzle archive is bundled. Configure only your own permitted content and provider
accounts. ESV/sports provider rights need review before commercial distribution.
