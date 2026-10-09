import contextlib
import datetime
import importlib.util
import io
import json
from pathlib import Path
import sqlite3
import stat
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("owner_access", Path(__file__).with_name("owner-access.py"))
owner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(owner)


class OwnerAccessTests(unittest.TestCase):
    def setUp(self):
        self.work = tempfile.TemporaryDirectory()
        self.directory = Path(self.work.name).resolve()
        self.database = self.directory / "household.sqlite"
        self.connection = sqlite3.connect(str(self.database))
        self.connection.executescript("""
        CREATE TABLE members (id TEXT PRIMARY KEY, household_id TEXT, role TEXT, archived_at TEXT);
        CREATE TABLE paired_devices (id TEXT PRIMARY KEY, household_id TEXT, revoked_at TEXT);
        CREATE TABLE passkey_credentials (id TEXT PRIMARY KEY, revoked_at TEXT);
        CREATE TABLE companion_sessions (id TEXT PRIMARY KEY, revoked_at TEXT);
        CREATE TABLE companion_recovery_codes (
          id TEXT PRIMARY KEY, household_id TEXT, member_id TEXT, code_hash TEXT UNIQUE,
          created_by_member_id TEXT, created_at TEXT, expires_at TEXT, consumed_at TEXT, revoked_at TEXT);
        CREATE UNIQUE INDEX one_code ON companion_recovery_codes(household_id, member_id)
          WHERE consumed_at IS NULL AND revoked_at IS NULL;
        CREATE TABLE audit_events (id TEXT PRIMARY KEY, occurred_at TEXT, household_id TEXT,
          actor_type TEXT, actor_id TEXT, source_channel TEXT, action_type TEXT, target_type TEXT,
          target_id TEXT, request_id TEXT, result TEXT, safe_summary_json TEXT);
        INSERT INTO members VALUES ('adult', 'home', 'adult', NULL), ('child', 'home', 'child', NULL);
        INSERT INTO paired_devices VALUES ('keep', 'home', NULL), ('old1', 'home', NULL),
          ('old2', 'home', NULL), ('other', 'another-home', NULL);
        INSERT INTO passkey_credentials VALUES ('working', NULL), ('revoked', 'before');
        INSERT INTO companion_sessions VALUES ('working-session', NULL);
        """)
        self.now = datetime.datetime(2026, 10, 9, tzinfo=datetime.timezone.utc)

    def tearDown(self):
        self.connection.close()
        self.work.cleanup()

    def test_obsolete_screens_are_revoked_audited_and_retries_are_inert(self):
        self.assertEqual(owner.revoke_screens(self.connection, "home", "keep", ["old1", "old2"], "now"), 2)
        self.assertEqual(owner.revoke_screens(self.connection, "home", "keep", ["old1", "old2"], "later"), 0)
        self.assertIsNone(self.connection.execute("SELECT revoked_at FROM paired_devices WHERE id='keep'").fetchone()[0])
        self.assertEqual(self.connection.execute("SELECT count(*) FROM audit_events").fetchone()[0], 2)
        self.assertEqual(self.connection.execute("SELECT actor_type, source_channel FROM audit_events LIMIT 1").fetchone(), ("system", "system"))

    def test_wrong_household_or_missing_screen_rolls_back_every_change(self):
        for targets in (["old1", "other"], ["old1", "missing"], ["keep"], ["old1", "old1"]):
            with self.assertRaises(ValueError):
                owner.revoke_screens(self.connection, "home", "keep", targets, "now")
            self.assertEqual(self.connection.execute("SELECT count(*) FROM paired_devices WHERE revoked_at IS NOT NULL").fetchone()[0], 0)
            self.assertEqual(self.connection.execute("SELECT count(*) FROM audit_events").fetchone()[0], 0)

    def test_recovery_is_short_lived_digest_only_without_touching_keys_or_sessions(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            path, expires = owner.issue_recovery(self.connection, "home", "adult", self.directory, self.now)
        code = path.read_text().strip()
        self.assertRegex(code, r"^([A-F0-9]{4}-){7}[A-F0-9]{4}$")
        self.assertEqual(expires, "2026-10-09T00:15:00.000Z")
        row = self.connection.execute("SELECT code_hash, created_by_member_id FROM companion_recovery_codes").fetchone()
        self.assertEqual(row[0], owner.hashlib.sha256(code.replace("-", "").encode()).hexdigest())
        self.assertEqual(row[1], "adult")
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        self.assertEqual(output.getvalue(), "")
        self.assertEqual(self.connection.execute("SELECT id FROM passkey_credentials WHERE revoked_at IS NULL").fetchall(), [("working",)])
        self.assertIsNone(self.connection.execute("SELECT revoked_at FROM companion_sessions").fetchone()[0])
        summary = self.connection.execute("SELECT safe_summary_json FROM audit_events").fetchone()[0]
        self.assertNotIn(code, summary)
        self.assertEqual(json.loads(summary)["issuer"], "nas-owner")

    def test_child_and_cross_household_grants_fail_without_a_code_or_database_change(self):
        for household, member in [("home", "child"), ("another-home", "adult"), ("home", "missing")]:
            with self.assertRaises(ValueError):
                owner.issue_recovery(self.connection, household, member, self.directory, self.now)
            self.assertFalse((self.directory / "one-time-recovery.txt").exists())
            self.assertEqual(self.connection.execute("SELECT count(*) FROM companion_recovery_codes").fetchone()[0], 0)

    def test_existing_file_is_never_overwritten(self):
        path = self.directory / "one-time-recovery.txt"
        path.write_text("keep")
        with self.assertRaises(FileExistsError):
            owner.issue_recovery(self.connection, "home", "adult", self.directory, self.now)
        self.assertEqual(path.read_text(), "keep")

    def test_consistent_online_backup_covers_wal_without_mutating_source(self):
        self.connection.execute("PRAGMA journal_mode=WAL")
        directory = owner.private_directory(self.directory)
        saved = owner.backup(self.connection, directory)
        with sqlite3.connect(str(saved)) as copy:
            self.assertEqual(copy.execute("SELECT count(*) FROM paired_devices").fetchone()[0], 4)
        self.assertEqual(stat.S_IMODE(saved.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(directory.stat().st_mode), 0o700)

    def test_symlink_and_missing_databases_are_rejected(self):
        link = self.directory / "link.sqlite"
        link.symlink_to(self.database)
        for path in (link, self.directory / "missing.sqlite"):
            with self.assertRaises((ValueError, FileNotFoundError)):
                owner.connect_database(path)

    def test_non_administrator_is_rejected(self):
        with patch.object(owner.os, "geteuid", return_value=123), patch.object(owner.grp, "getgrnam", side_effect=KeyError):
            with self.assertRaises(ValueError):
                owner.require_owner()


if __name__ == "__main__":
    unittest.main()
