#!/usr/bin/env python3
"""Package only public code. No runtime/configuration directories are ever visited."""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / 'apps/web/public/downloads'
COMPONENT = ROOT / 'integrations/home_assistant/custom_components/hearth'
FILES = ['__init__.py', 'calendar.py', 'client.py', 'config_flow.py', 'const.py', 'coordinator.py', 'entity.py', 'manifest.json', 'select.py', 'sensor.py', 'strings.json', 'switch.py', 'todo.py', 'translations/en.json']


def write_zip(output, files):
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in sorted(files.items()):
            entry = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, content)


def build(destination=DESTINATION):
    destination.mkdir(parents=True, exist_ok=True)
    component = {name: (COMPONENT / name).read_bytes() for name in FILES}
    manifest = {'version': json.loads(component['manifest.json'])['version'], 'files': {name: hashlib.sha256(content).hexdigest() for name, content in component.items()}}
    files = {'custom_components/hearth/' + name: content for name, content in component.items()}
    files.update({'install.py': (ROOT / 'integrations/home_assistant/install.py').read_bytes(), 'hearth-package.json': json.dumps(manifest, sort_keys=True).encode(), 'README.md': b'# Hearth for HA\n\nRun python3 install.py on the HA host, or copy custom_components/hearth into your HA configuration directory. Restart HA when convenient. Add the Hearth integration, enter your private Hearth HTTPS address, then approve its six letters in Hearth on an adult phone. No MQTT or long key is needed for this direction. TV power/app launch and optional indoor sensors are separate.\n'})
    write_zip(destination / 'hearth-home-assistant.zip', files)
    portable = ROOT / 'deploy/portable'
    if portable.is_dir():
        write_zip(destination / 'hearth-server-setup.zip', {name: (portable / name).read_bytes() for name in ['install.py', 'README.md', 'setup-format.json']})


if __name__ == '__main__':
    build()
