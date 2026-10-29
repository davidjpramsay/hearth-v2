import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[3]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


installer = load('component_installer', ROOT / 'integrations/home_assistant/install.py')
builder = load('setup_builder', ROOT / 'scripts/build-setup-downloads.py')


class ComponentInstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        builder.build(self.root / 'downloads')
        self.package = self.root / 'package'
        with zipfile.ZipFile(self.root / 'downloads/hearth-home-assistant.zip') as archive:
            archive.extractall(self.package)
        self.config = self.root / 'config'
        self.config.mkdir()
        (self.config / 'configuration.yaml').write_text('fictional config preserved')
        (self.config / '.storage').mkdir()
        (self.config / '.storage/private').write_text('fictional secret never read')

    def test_deterministic_public_code_bundle_only(self):
        first = (self.root / 'downloads/hearth-home-assistant.zip').read_bytes()
        builder.build(self.root / 'downloads')
        self.assertEqual(first, (self.root / 'downloads/hearth-home-assistant.zip').read_bytes())
        with zipfile.ZipFile(self.root / 'downloads/hearth-home-assistant.zip') as archive:
            names = set(archive.namelist())
            self.assertEqual(names, {'custom_components/hearth/' + name for name in builder.FILES} | {'install.py', 'hearth-package.json', 'README.md'})
            self.assertFalse(any('.storage' in name or 'token' in name for name in names))

    def test_new_install_and_update_preserve_configuration_and_rollback_copy(self):
        version, backup = installer.install(self.package, self.config)
        self.assertEqual(version, json.loads((self.package / 'hearth-package.json').read_text())['version'])
        self.assertIsNone(backup)
        target = self.config / 'custom_components/hearth'
        (target / 'const.py').write_text('# previous version')
        _, backup = installer.install(self.package, self.config)
        self.assertEqual((backup / 'const.py').read_text(), '# previous version')
        self.assertNotEqual((target / 'const.py').read_text(), '# previous version')
        self.assertEqual((self.config / 'configuration.yaml').read_text(), 'fictional config preserved')
        self.assertEqual((self.config / '.storage/private').read_text(), 'fictional secret never read')
        self.assertEqual(backup.parent.stat().st_mode & 0o777, 0o700)

    def test_failed_replace_restores_old_component(self):
        installer.install(self.package, self.config)
        target = self.config / 'custom_components/hearth'
        (target / 'const.py').write_text('# previous version')
        original = installer.os.replace
        def fail_staging(source, destination):
            if Path(source).name.startswith('.hearth-new-'):
                raise OSError('fixture interruption')
            return original(source, destination)
        with patch.object(installer.os, 'replace', side_effect=fail_staging), self.assertRaises(OSError):
            installer.install(self.package, self.config)
        self.assertEqual((target / 'const.py').read_text(), '# previous version')
        self.assertFalse((target.parent / '.hearth-install-lock').exists())

    def test_modified_and_extra_files_are_refused_before_install(self):
        (self.package / 'custom_components/hearth/client.py').write_text('unexpected')
        with self.assertRaises(ValueError):
            installer.install(self.package, self.config)
        self.assertFalse((self.config / 'custom_components').exists())

    def test_traversal_or_missing_package_entries_are_rejected(self):
        manifest_path = self.package / 'hearth-package.json'
        manifest = json.loads(manifest_path.read_text())
        manifest['files']['../../outside'] = 'a' * 64
        manifest_path.write_text(json.dumps(manifest))
        with self.assertRaises(ValueError):
            installer.install(self.package, self.config)
        self.assertFalse((self.config / 'custom_components').exists())

    def test_symlink_destinations_and_other_running_installer_are_refused(self):
        (self.config / 'custom_components').symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(ValueError):
            installer.install(self.package, self.config)
        (self.config / 'custom_components').unlink()
        (self.config / 'custom_components').mkdir()
        (self.config / 'custom_components/.hearth-install-lock').mkdir()
        with self.assertRaises(FileExistsError):
            installer.install(self.package, self.config)


if __name__ == '__main__':
    unittest.main()
