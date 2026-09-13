"""Full server backups (database + media) the owner can create and download.

A backup made here uses the same folder layout as scripts/server/backup.sh —
``<label>-<YYYYmmdd-HHMMSS>/`` holding ``db.dump``, ``media.tar.gz``,
``checksums.txt`` and ``deployed-commit.txt`` — so scripts/server/restore.sh
restores it exactly like a nightly backup, and the nightly backups show up in
the web app's list for download too.

Backups live on the same disk as the app. The point of the download is to get
a copy OFF the server (the owner's own hard disk) so a lost VPS is recoverable.
"""
from __future__ import annotations

import glob
import hashlib
import os
import re
import shutil
import subprocess
import tarfile
import time
from datetime import datetime, timezone as dt_timezone
from pathlib import Path
from typing import Any

from django.conf import settings
from django.db import connection

# Must match the default in scripts/server/backup.sh.
DEFAULT_SERVER_BACKUP_ROOT = "/var/backups/subidha"
DOWNLOADABLE_FILES = ("db.dump", "media.tar.gz", "checksums.txt")
MANUAL_LABEL = "manual"
# Web-app backups kept on the server; older ones are pruned. Nightly
# `scheduled-*` backups keep their own retention in backup.sh.
MANUAL_KEEP = 5
DB_DUMP_TIMEOUT_SECONDS = 30 * 60

_NAME_RE = re.compile(r"^(?P<label>[A-Za-z0-9_-]+?)-(?P<stamp>\d{8}-\d{6})$")
_LOCK_NAME = ".webapp-backup.lock"
_LOCK_STALE_SECONDS = 60 * 60


class ServerBackupError(Exception):
    """A backup could not be made; the message is safe to show the admin."""


def backup_root() -> Path:
    return Path((getattr(settings, "BACKUP_ROOT", "") or "").strip() or DEFAULT_SERVER_BACKUP_ROOT)


def media_root() -> Path:
    return Path(settings.MEDIA_ROOT)


def _pg_major(path: str) -> int:
    match = re.search(r"PostgreSQL[\\/](\d+)", path)
    return int(match.group(1)) if match else 0


def find_pg_dump() -> str | None:
    configured = (getattr(settings, "PG_DUMP_BINARY", "") or os.getenv("PG_DUMP_BINARY", "")).strip()
    if configured:
        return configured if (Path(configured).is_file() or shutil.which(configured)) else None
    found = shutil.which("pg_dump")
    if found:
        return found
    if os.name == "nt":
        # Local dev: the Windows PostgreSQL installer does not put itself on PATH.
        # Newest client wins — pg_dump must be >= the server's major version.
        candidates = glob.glob(r"C:\Program Files\PostgreSQL\*\bin\pg_dump.exe")
        if candidates:
            return max(candidates, key=_pg_major)
    return None


def _dir_stats(root: Path) -> tuple[int, int]:
    count = size = 0
    if not root.is_dir():
        return 0, 0
    for dirpath, _dirs, files in os.walk(root):
        for name in files:
            try:
                size += os.path.getsize(os.path.join(dirpath, name))
            except OSError:
                continue
            count += 1
    return count, size


def _describe(path: Path) -> dict[str, Any] | None:
    match = _NAME_RE.match(path.name)
    if not match or not path.is_dir():
        return None
    files = [
        {"name": name, "size_bytes": (path / name).stat().st_size}
        for name in DOWNLOADABLE_FILES
        if (path / name).is_file()
    ]
    commit_file = path / "deployed-commit.txt"
    commit = commit_file.read_text(encoding="utf-8", errors="ignore").strip()[:40] if commit_file.is_file() else ""
    names = {f["name"] for f in files}
    return {
        "name": path.name,
        "label": match["label"],
        # Folder mtime = when the backup finished. The name's stamp is in the
        # server's local clock, which may not be the business time zone.
        "created_at": datetime.fromtimestamp(path.stat().st_mtime, tz=dt_timezone.utc).isoformat(),
        "size_bytes": sum(f["size_bytes"] for f in files),
        "files": files,
        "has_database": "db.dump" in names,
        "has_media": "media.tar.gz" in names,
        "deployed_commit": commit,
    }


def list_backups(limit: int = 60) -> list[dict[str, Any]]:
    root = backup_root()
    if not root.is_dir():
        return []
    rows = [row for row in (_describe(p) for p in root.iterdir()) if row]
    rows.sort(key=lambda row: row["created_at"], reverse=True)
    return rows[:limit]


def overview() -> dict[str, Any]:
    root = backup_root()
    media = media_root()
    media_count, media_size = _dir_stats(media)
    return {
        "backup_root": str(root),
        "backup_root_exists": root.is_dir(),
        "media_root": str(media),
        "media_file_count": media_count,
        "media_size_bytes": media_size,
        "database_engine": connection.vendor,
        "database_backup_available": connection.vendor == "postgresql" and bool(find_pg_dump()),
        "manual_keep": MANUAL_KEEP,
        "backups": list_backups(),
    }


def _acquire_lock(lock: Path) -> None:
    for _attempt in range(2):
        try:
            os.close(os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY))
            return
        except FileExistsError:
            try:
                age = time.time() - lock.stat().st_mtime
            except FileNotFoundError:
                continue
            if age < _LOCK_STALE_SECONDS:
                raise ServerBackupError("A backup is already running. Try again in a few minutes.")
            lock.unlink(missing_ok=True)
    raise ServerBackupError("A backup is already running. Try again in a few minutes.")


def _dump_database(target: Path) -> None:
    if connection.vendor != "postgresql":
        raise ServerBackupError(f"Database backup needs PostgreSQL; this server uses {connection.vendor}.")
    binary = find_pg_dump()
    if not binary:
        raise ServerBackupError("pg_dump was not found on the server. Install the PostgreSQL client tools or set PG_DUMP_BINARY.")
    db = settings.DATABASES["default"]
    cmd = [binary, "-Fc", "--no-password", "-f", str(target), "-d", str(db["NAME"])]
    if db.get("HOST"):
        cmd += ["-h", str(db["HOST"])]
    if db.get("PORT"):
        cmd += ["-p", str(db["PORT"])]
    if db.get("USER"):
        cmd += ["-U", str(db["USER"])]
    env = dict(os.environ)
    if db.get("PASSWORD"):
        env["PGPASSWORD"] = str(db["PASSWORD"])
    try:
        result = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=DB_DUMP_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired as exc:
        raise ServerBackupError("Database backup timed out after 30 minutes.") from exc
    if result.returncode != 0:
        raise ServerBackupError(f"Database backup failed: {(result.stderr or '').strip()[-500:]}")

    # Same check backup.sh runs: the dump must be readable by pg_restore.
    restore_bin = Path(binary).with_name("pg_restore" + Path(binary).suffix)
    if restore_bin.is_file():
        check = subprocess.run([str(restore_bin), "--list", str(target)], capture_output=True, text=True, timeout=300)
        if check.returncode != 0:
            raise ServerBackupError("Database backup was written but is not restorable (pg_restore --list failed).")


def _archive_media(target: Path) -> None:
    media = media_root()
    with tarfile.open(target, "w:gz") as tar:
        if media.is_dir():
            # arcname "." mirrors `tar -C MEDIA_ROOT .` so restore.sh extracts in place.
            tar.add(str(media), arcname=".")


def _write_commit(target: Path) -> None:
    try:
        sha = subprocess.run(
            ["git", "-C", str(settings.BASE_DIR), "rev-parse", "HEAD"],
            capture_output=True, text=True, timeout=15,
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        sha = ""
    if re.fullmatch(r"[0-9a-f]{40}", sha):
        target.write_text(sha + "\n", encoding="utf-8")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _write_checksums(dest: Path) -> None:
    # Relative names, so `sha256sum -c checksums.txt` works from the folder
    # after the files are copied to another machine.
    lines = [
        f"{_sha256(f)}  {f.name}"
        for f in sorted(dest.iterdir())
        if f.is_file() and f.name != "checksums.txt"
    ]
    (dest / "checksums.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


def _prune_manual(root: Path) -> None:
    manual = sorted(
        (p for p in root.iterdir() if p.is_dir() and (m := _NAME_RE.match(p.name)) and m["label"] == MANUAL_LABEL),
        key=lambda p: p.name,
        reverse=True,
    )
    for old in manual[MANUAL_KEEP:]:
        shutil.rmtree(old, ignore_errors=True)


def create_backup(*, include_database: bool = True) -> dict[str, Any]:
    root = backup_root()
    try:
        root.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise ServerBackupError(f"Backup folder {root} cannot be created: {exc.strerror}") from exc
    lock = root / _LOCK_NAME
    _acquire_lock(lock)
    try:
        # Server-local clock, same as backup.sh's `date +%Y%m%d-%H%M%S`.
        dest = root / f"{MANUAL_LABEL}-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        dest.mkdir()
        try:
            if include_database:
                _dump_database(dest / "db.dump")
            _archive_media(dest / "media.tar.gz")
            _write_commit(dest / "deployed-commit.txt")
            _write_checksums(dest)
        except Exception:
            shutil.rmtree(dest, ignore_errors=True)
            raise
        _prune_manual(root)
        described = _describe(dest)
        assert described is not None
        return described
    finally:
        lock.unlink(missing_ok=True)


def resolve_download(name: str, filename: str) -> Path:
    """Path of one downloadable file inside one backup, or FileNotFoundError."""
    if filename not in DOWNLOADABLE_FILES or not _NAME_RE.match(name or ""):
        raise FileNotFoundError(filename)
    root = backup_root().resolve()
    path = (root / name / filename).resolve()
    if path.parent.parent != root or not path.is_file():
        raise FileNotFoundError(filename)
    return path
