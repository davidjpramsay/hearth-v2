#!/usr/bin/env python3
"""Local NAS administrator maintenance. No HTTP endpoint or authentication bypass."""

import argparse
import datetime
import grp
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import stat
import tempfile
import uuid


def require_owner():
    if os.geteuid() == 0:
        return
    try:
        administrators = grp.getgrnam("administrators").gr_gid
    except KeyError:
        raise ValueError("Run locally as root or a NAS administrators-group member.")
    if administrators not in set(os.getgroups()) | {os.getegid()}:
        raise ValueError("Run locally as root or a NAS administrators-group member.")


def timestamp(value):
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def connect_database(path):
    path = Path(path)
    if not path.is_absolute() or path.resolve(strict=True) != path:
        raise ValueError("Database must be an existing absolute path without symlinks.")
    if not stat.S_ISREG(path.stat().st_mode):
        raise ValueError("Database must be a regular file.")
    connection = sqlite3.connect(path.as_uri() + "?mode=rw", uri=True, timeout=10)
    connection.execute("PRAGMA foreign_keys=ON")
    return connection


def verify_database(connection):
    if connection.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
        raise ValueError("Database integrity check failed.")
    if connection.execute("PRAGMA foreign_key_check").fetchone() is not None:
        raise ValueError("Database foreign-key check failed.")


def private_directory(parent):
    parent = Path(parent)
    if not parent.is_absolute() or parent.resolve(strict=True) != parent:
        raise ValueError("Private work parent must be absolute and have no symlinks.")
    directory = Path(tempfile.mkdtemp(prefix="hearth-owner-access-", dir=str(parent)))
    if stat.S_IMODE(directory.stat().st_mode) != 0o700:
        raise ValueError("Private directory permissions are not 0700; stopped.")
    return directory


def private_file(path, value):
    descriptor = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "w") as output:
        if stat.S_IMODE(os.fstat(output.fileno()).st_mode) != 0o600:
            raise ValueError("Private file permissions are not 0600; stopped.")
        output.write(value)
        output.flush()
        os.fsync(output.fileno())


def backup(connection, directory):
    path = directory / "before.sqlite"
    private_file(path, "")
    with sqlite3.connect(str(path)) as copy:
        connection.backup(copy)
        verify_database(copy)
    if stat.S_IMODE(path.stat().st_mode) != 0o600:
        raise ValueError("Backup permissions changed; stopped.")
    return path


def audit(connection, household, action, target_type, target, now, summary):
    connection.execute(
        """INSERT INTO audit_events
        (id, occurred_at, household_id, actor_type, actor_id, source_channel, action_type,
         target_type, target_id, request_id, result, safe_summary_json)
        VALUES (?, ?, ?, 'system', ?, 'system', ?, ?, ?, NULL, 'succeeded', ?)""",
        ("audit_owner_" + uuid.uuid4().hex, now, household,
         "nas_owner_uid_" + str(os.geteuid()), action, target_type, target,
         json.dumps(dict(summary, issuer="nas-owner"))),
    )


def revoke_screens(connection, household, keep, targets, now):
    if not targets or len(set(targets)) != len(targets) or keep in targets:
        raise ValueError("Supply distinct obsolete screens and a separate retained screen.")
    connection.execute("BEGIN IMMEDIATE")
    try:
        if connection.execute(
            "SELECT 1 FROM paired_devices WHERE id=? AND household_id=? AND revoked_at IS NULL",
            (keep, household),
        ).fetchone() is None:
            raise ValueError("The retained screen is not active in this household.")
        changed = 0
        for target in targets:
            row = connection.execute(
                "SELECT revoked_at FROM paired_devices WHERE id=? AND household_id=?",
                (target, household),
            ).fetchone()
            if row is None:
                raise ValueError("An obsolete screen is not in this household; nothing changed.")
            if row[0] is not None:
                continue
            connection.execute("UPDATE paired_devices SET revoked_at=? WHERE id=?", (now, target))
            audit(connection, household, "device.revoke", "paired_device", target, now,
                  {"reason": "owner-confirmed obsolete screen"})
            changed += 1
        connection.commit()
        return changed
    except Exception:
        connection.rollback()
        raise


def issue_recovery(connection, household, member, directory, now):
    # Keep the existing public recovery ceremony: it still requires a new user-verified passkey.
    # No key/session is revoked until that ceremony succeeds. Never revive a revoked passkey.
    created = timestamp(now)
    expires = timestamp(now + datetime.timedelta(minutes=15))
    raw = secrets.token_hex(16).upper()
    code = "-".join(raw[index:index + 4] for index in range(0, len(raw), 4))
    output = directory / "one-time-recovery.txt"
    private_file(output, code + "\n")
    connection.execute("BEGIN IMMEDIATE")
    try:
        if connection.execute(
            "SELECT 1 FROM members WHERE id=? AND household_id=? AND role='adult' AND archived_at IS NULL",
            (member, household),
        ).fetchone() is None:
            raise ValueError("Choose an existing active adult; nothing changed.")
        connection.execute(
            """UPDATE companion_recovery_codes SET revoked_at=? WHERE household_id=? AND member_id=?
               AND consumed_at IS NULL AND revoked_at IS NULL""", (created, household, member),
        )
        recovery_id = "recovery_owner_" + uuid.uuid4().hex
        connection.execute(
            """INSERT INTO companion_recovery_codes
            (id, household_id, member_id, code_hash, created_by_member_id, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)""",
            # Legacy non-null member FK denotes the beneficiary for an owner-issued record;
            # the actual issuer is always the system actor in the mandatory same-transaction audit.
            (recovery_id, household, member, hashlib.sha256(raw.encode()).hexdigest(),
             member, created, expires),
        )
        audit(connection, household, "auth.recovery-code.rotate", "companion_recovery_code",
              recovery_id, created, {"memberId": member, "expiresAt": expires,
                                     "reason": "owner-authorized account recovery"})
        connection.commit()
        return output, expires
    except Exception:
        connection.rollback()
        output.unlink()
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True)
    parser.add_argument("--household", required=True)
    parser.add_argument("--private-parent", default="/tmp")
    commands = parser.add_subparsers(dest="command", required=True)
    screens = commands.add_parser("revoke-screens")
    screens.add_argument("--keep", required=True)
    screens.add_argument("--revoke", action="append", required=True)
    recovery = commands.add_parser("issue-recovery")
    recovery.add_argument("--member", required=True)
    args = parser.parse_args()
    require_owner()
    directory = private_directory(args.private_parent)
    connection = connect_database(args.database)
    try:
        verify_database(connection)
        saved = backup(connection, directory)
        now = datetime.datetime.now(datetime.timezone.utc)
        if args.command == "revoke-screens":
            count = revoke_screens(connection, args.household, args.keep, args.revoke, timestamp(now))
            result = {"revokedScreens": count, "backup": str(saved)}
        else:
            output, expires = issue_recovery(connection, args.household, args.member, directory, now)
            result = {"recoveryFile": str(output), "expiresAt": expires, "backup": str(saved)}
        verify_database(connection)
        print(json.dumps(result))  # Paths/expiry/count only. Never print a code, hash or credential.
    finally:
        connection.close()


if __name__ == "__main__":
    try:
        main()
    except (ValueError, sqlite3.Error, OSError) as error:
        # Do not serialize SQL/OS exception details (may contain private paths or values).
        raise SystemExit("Owner maintenance stopped safely; inspect the private operation locally.") from error
