#!/usr/bin/env python3
"""Install only the bundled Hearth component. Never read HA configuration or restart HA."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import tempfile
import uuid

FILES = {'__init__.py', 'calendar.py', 'client.py', 'config_flow.py', 'const.py', 'coordinator.py', 'entity.py', 'manifest.json', 'select.py', 'sensor.py', 'strings.json', 'switch.py', 'todo.py', 'translations/en.json'}


def no_links(path):
    path = Path(os.path.abspath(path))
    for part in (path, *path.parents):
        if part.is_symlink():
            raise ValueError('Symlink paths are not supported.')
    return path


def validate_package(package):
    package = no_links(package)
    manifest = json.loads(no_links(package / 'hearth-package.json').read_text())
    source = package / 'custom_components' / 'hearth'
    expected = manifest['files']
    if not isinstance(expected, dict) or set(expected) != FILES:
        raise ValueError('Unexpected component files.')
    actual = set()
    for item in source.rglob('*'):
        no_links(item)
        if item.is_dir():
            continue
        relative = item.relative_to(source).as_posix()
        if not stat.S_ISREG(item.stat().st_mode) or item.stat().st_size > 1024 * 1024:
            raise ValueError('Invalid component file.')
        actual.add(relative)
        if hashlib.sha256(item.read_bytes()).hexdigest() != expected.get(relative):
            raise ValueError('Component files do not match the bundle.')
    if actual != set(expected) or not 1 <= len(actual) <= 40:
        raise ValueError('Incomplete component bundle.')
    if any(Path(name).is_absolute() or '..' in Path(name).parts for name in expected):
        raise ValueError('Invalid component path.')
    metadata = json.loads((source / 'manifest.json').read_text())
    if metadata.get('domain') != 'hearth' or metadata.get('version') != manifest['version']:
        raise ValueError('Wrong component or version.')
    return source, manifest['version']


def install(package, config):
    source, version = validate_package(package)
    config = no_links(config)
    if not config.is_dir() or not (config / 'configuration.yaml').is_file():
        raise ValueError('Choose the HA configuration folder containing configuration.yaml.')
    components = no_links(config / 'custom_components')
    components.mkdir(exist_ok=True)
    target = no_links(components / 'hearth')
    lock = components / '.hearth-install-lock'
    lock.mkdir(mode=0o700)  # A second installer must not race this one.
    staging = None
    backup = None
    try:
        staging = Path(tempfile.mkdtemp(prefix='.hearth-new-', dir=components))
        shutil.copytree(source, staging, dirs_exist_ok=True)
        for item in staging.rglob('*'):
            item.chmod(0o755 if item.is_dir() else 0o644)
        staging.chmod(0o755)
        if target.exists():
            if not target.is_dir():
                raise ValueError('Existing Hearth component is not a directory.')
            for item in target.rglob('*'):
                no_links(item)
                if not item.is_dir() and not stat.S_ISREG(item.stat().st_mode):
                    raise ValueError('Existing component contains an unsupported file.')
            backups = no_links(config / '.hearth-integration-backups')
            backups.mkdir(mode=0o700, exist_ok=True)
            backups.chmod(0o700)
            backup = backups / ('hearth-' + uuid.uuid4().hex)
            os.replace(target, backup)
        try:
            os.replace(staging, target)
            staging = None
        except BaseException:
            if backup is not None:
                os.replace(backup, target)
            raise
    finally:
        if staging is not None:
            shutil.rmtree(staging)
        lock.rmdir()
    return version, backup


def main():
    parser = argparse.ArgumentParser(description='Install/update the bundled Hearth integration. No tokens needed.')
    parser.add_argument('--config', type=Path)
    args = parser.parse_args()
    folder = args.config or Path(input('HA configuration folder (contains configuration.yaml): ').strip()).expanduser()
    print('This replaces only custom_components/hearth and keeps a private rollback copy.')
    print('It does not change HA settings, permissions, automations or restart HA.')
    if input('Install this integration? [y/N] ').strip().lower() != 'y':
        print('Cancelled. No files changed.')
        return
    try:
        version, backup = install(Path(__file__).resolve().parent, folder)
    except (OSError, ValueError, KeyError):
        raise SystemExit('Stopped safely. Check the package, folder permissions and absence of another installer. No secret is shown.')
    print('Installed Hearth ' + version + '. Restart HA when convenient, then add Hearth and approve its six letters from your adult Hearth phone.')
    if backup is not None:
        print('The previous component is kept in .hearth-integration-backups. Your HA connections were not changed.')


if __name__ == '__main__':
    main()
