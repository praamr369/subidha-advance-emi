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
import gzip
import hashlib
import hmac
import json
import os
import re
import shutil
import subprocess
import tarfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone as dt_timezone
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.management import call_command
from django.db import connection
from django.utils import timezone


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


# -------------------------------------------------------------------------
# Free Cloud Storage (Cloudflare R2 & Google Drive rclone) Integration
# -------------------------------------------------------------------------

def get_or_create_cloud_storage_settings():
    from business_setup.models.cloud_storage import CloudStorageProvider, FreeCloudStorageSettings

    obj = FreeCloudStorageSettings.objects.filter(is_active=True).first()
    if not obj:
        obj = FreeCloudStorageSettings.objects.create(
            provider=CloudStorageProvider.CLOUDFLARE_R2,
            is_enabled=False,
            is_active=True,
        )
    return obj


def _s3_sigv4_headers(
    method: str,
    host: str,
    canonical_uri: str,
    access_key: str,
    secret_key: str,
    region: str = "auto",
    service: str = "s3",
    payload: bytes = b"",
    content_type: str = "application/octet-stream",
) -> dict[str, str]:
    now = datetime.now(dt_timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")
    payload_hash = hashlib.sha256(payload).hexdigest()

    canonical_headers = (
        f"content-type:{content_type}\n"
        f"host:{host}\n"
        f"x-amz-content-sha256:{payload_hash}\n"
        f"x-amz-date:{amz_date}\n"
    )
    signed_headers = "content-type;host;x-amz-content-sha256;x-amz-date"
    canonical_request = (
        f"{method}\n{canonical_uri}\n\n{canonical_headers}\n{signed_headers}\n{payload_hash}"
    )

    algorithm = "AWS4-HMAC-SHA256"
    credential_scope = f"{date_stamp}/{region}/{service}/aws4_request"
    string_to_sign = (
        f"{algorithm}\n{amz_date}\n{credential_scope}\n"
        f"{hashlib.sha256(canonical_request.encode('utf-8')).hexdigest()}"
    )

    def sign(key: bytes, msg: str) -> bytes:
        return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()

    k_date = sign(("AWS4" + secret_key).encode("utf-8"), date_stamp)
    k_region = sign(k_date, region)
    k_service = sign(k_region, service)
    k_signing = sign(k_service, "aws4_request")

    signature = hmac.new(k_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
    authorization = (
        f"{algorithm} Credential={access_key}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )

    return {
        "Host": host,
        "x-amz-date": amz_date,
        "x-amz-content-sha256": payload_hash,
        "Authorization": authorization,
        "Content-Type": content_type,
    }


def _parse_s3_endpoint(endpoint: str) -> tuple[str, str]:
    clean = endpoint.strip()
    if not clean.startswith(("http://", "https://")):
        clean = "https://" + clean
    parsed = urllib.parse.urlparse(clean)
    scheme = parsed.scheme or "https"
    host = parsed.netloc or parsed.path.split("/")[0]
    return scheme, host


def _s3_http_request(
    method: str,
    url: str,
    headers: dict[str, str],
    payload: bytes = b"",
    timeout: int = 15,
) -> tuple[int, str]:
    req = urllib.request.Request(
        url,
        data=payload if method != "DELETE" else None,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", errors="ignore")
    except urllib.error.HTTPError as err:
        return err.code, err.read().decode("utf-8", errors="ignore")


def test_cloud_connection(settings_obj=None) -> dict[str, Any]:
    from business_setup.models.cloud_storage import CloudStorageProvider

    cfg = settings_obj or get_or_create_cloud_storage_settings()
    now = timezone.now()

    if cfg.provider == CloudStorageProvider.LOCAL_ONLY:
        cfg.last_test_at = now
        cfg.last_test_success = True
        cfg.last_test_message = "Local storage mode is selected. No remote cloud connection required."
        cfg.save(update_fields=["last_test_at", "last_test_success", "last_test_message"])
        return {"success": True, "message": cfg.last_test_message}

    if cfg.provider == CloudStorageProvider.CLOUDFLARE_R2:
        if not cfg.endpoint_url or not cfg.bucket_name or not cfg.access_key_id:
            msg = "Missing Cloudflare R2 credentials (endpoint, bucket name, or access key)."
            cfg.last_test_at = now
            cfg.last_test_success = False
            cfg.last_test_message = msg
            cfg.save(update_fields=["last_test_at", "last_test_success", "last_test_message"])
            return {"success": False, "message": msg}

        secret = cfg.get_secret_access_key()
        if not secret:
            msg = "Secret Access Key is empty. Please enter and save your secret access key."
            cfg.last_test_at = now
            cfg.last_test_success = False
            cfg.last_test_message = msg
            cfg.save(update_fields=["last_test_at", "last_test_success", "last_test_message"])
            return {"success": False, "message": msg}

        scheme, host = _parse_s3_endpoint(cfg.endpoint_url)
        test_key = ".subidha_test_probe.txt"
        canonical_uri = f"/{cfg.bucket_name}/{test_key}"
        url = f"{scheme}://{host}{canonical_uri}"
        probe_data = b"subidha_r2_ok"

        try:
            # 1. PUT test probe
            headers = _s3_sigv4_headers(
                method="PUT",
                host=host,
                canonical_uri=canonical_uri,
                access_key=cfg.access_key_id,
                secret_key=secret,
                payload=probe_data,
                content_type="text/plain",
            )
            status_code, body = _s3_http_request("PUT", url, headers, probe_data, timeout=15)
            if status_code not in (200, 201, 204):
                msg = f"Cloudflare R2 returned HTTP {status_code}: {body[:200]}"
                cfg.last_test_at = now
                cfg.last_test_success = False
                cfg.last_test_message = msg
                cfg.save(update_fields=["last_test_at", "last_test_success", "last_test_message"])
                return {"success": False, "message": msg}

            # 2. DELETE test probe to leave bucket clean
            del_headers = _s3_sigv4_headers(
                method="DELETE",
                host=host,
                canonical_uri=canonical_uri,
                access_key=cfg.access_key_id,
                secret_key=secret,
                payload=b"",
                content_type="text/plain",
            )
            _s3_http_request("DELETE", url, del_headers, b"", timeout=10)

            msg = f"Successfully connected to Cloudflare R2 bucket '{cfg.bucket_name}' (Read/Write verified)."
            cfg.last_test_at = now
            cfg.last_test_success = True
            cfg.last_test_message = msg
            cfg.save(update_fields=["last_test_at", "last_test_success", "last_test_message"])
            return {"success": True, "message": msg}
        except Exception as exc:
            msg = f"Connection failed: {str(exc)[:250]}"
            cfg.last_test_at = now
            cfg.last_test_success = False
            cfg.last_test_message = msg
            cfg.save(update_fields=["last_test_at", "last_test_success", "last_test_message"])
            return {"success": False, "message": msg}


    if cfg.provider == CloudStorageProvider.GOOGLE_DRIVE:
        rclone_bin = shutil.which("rclone")
        if not rclone_bin:
            msg = "rclone binary not found on this server. Install via 'sudo apt-get install rclone' and run 'rclone config'."
            cfg.last_test_at = now
            cfg.last_test_success = False
            cfg.last_test_message = msg
            cfg.save(update_fields=["last_test_at", "last_test_success", "last_test_message"])
            return {"success": False, "message": msg}

        remote = (cfg.rclone_remote_name or "").split(":")[0] + ":"
        try:
            p = subprocess.run([rclone_bin, "lsd", remote], capture_output=True, text=True, timeout=15)
            if p.returncode != 0:
                msg = f"rclone test failed for '{remote}': {p.stderr[:200]}"
                cfg.last_test_at = now
                cfg.last_test_success = False
                cfg.last_test_message = msg
                cfg.save(update_fields=["last_test_at", "last_test_success", "last_test_message"])
                return {"success": False, "message": msg}

            msg = f"rclone successfully verified connection to Google Drive remote '{remote}'."
            cfg.last_test_at = now
            cfg.last_test_success = True
            cfg.last_test_message = msg
            cfg.save(update_fields=["last_test_at", "last_test_success", "last_test_message"])
            return {"success": True, "message": msg}
        except Exception as exc:
            msg = f"Google Drive rclone test error: {str(exc)[:250]}"
            cfg.last_test_at = now
            cfg.last_test_success = False
            cfg.last_test_message = msg
            cfg.save(update_fields=["last_test_at", "last_test_success", "last_test_message"])
            return {"success": False, "message": msg}

    return {"success": False, "message": "Unknown storage provider."}


def upload_file_to_cloud(local_path: Path, cloud_dest_key: str, settings_obj=None) -> tuple[bool, str]:
    from business_setup.models.cloud_storage import CloudStorageProvider

    cfg = settings_obj or get_or_create_cloud_storage_settings()
    if not cfg.is_enabled:
        return False, "Free cloud storage is disabled in settings."

    if not local_path.is_file():
        return False, f"File {local_path} does not exist."

    if cfg.provider == CloudStorageProvider.CLOUDFLARE_R2:
        secret = cfg.get_secret_access_key()
        if not secret:
            return False, "Cloudflare R2 secret key is missing."
        scheme, host = _parse_s3_endpoint(cfg.endpoint_url)
        canonical_uri = f"/{cfg.bucket_name}/{cloud_dest_key.lstrip('/')}"
        url = f"{scheme}://{host}{canonical_uri}"

        with local_path.open("rb") as f:
            data = f.read()

        content_type = "application/gzip" if str(local_path).endswith((".gz", ".dump")) else "application/octet-stream"
        headers = _s3_sigv4_headers(
            method="PUT",
            host=host,
            canonical_uri=canonical_uri,
            access_key=cfg.access_key_id,
            secret_key=secret,
            payload=data,
            content_type=content_type,
        )
        try:
            status_code, body = _s3_http_request("PUT", url, headers, data, timeout=180)
            if status_code in (200, 201, 204):
                return True, f"Uploaded to Cloudflare R2: {cloud_dest_key}"
            return False, f"Cloudflare R2 HTTP {status_code}: {body[:200]}"
        except Exception as exc:
            return False, f"Cloudflare R2 upload error: {str(exc)[:250]}"

    if cfg.provider == CloudStorageProvider.GOOGLE_DRIVE:
        rclone_bin = shutil.which("rclone")
        if not rclone_bin:
            return False, "rclone binary not found on server."
        dest_target = f"{cfg.rclone_remote_name.rstrip('/')}/{cloud_dest_key.lstrip('/')}"
        dest_dir = "/".join(dest_target.split("/")[:-1])
        try:
            p = subprocess.run([rclone_bin, "copy", str(local_path), dest_dir], capture_output=True, text=True, timeout=180)
            if p.returncode == 0:
                return True, f"Synced to Google Drive via rclone: {dest_target}"
            return False, f"rclone error: {p.stderr[:250]}"
        except Exception as exc:
            return False, f"rclone sync error: {str(exc)[:250]}"

    return False, "Local storage mode: no upload executed."


def sync_backup_to_cloud(name: str) -> dict[str, Any]:
    root = backup_root()
    folder = root / name
    if not folder.is_dir() or not _NAME_RE.match(name):
        raise ServerBackupError(f"Backup {name} not found.")

    cfg = get_or_create_cloud_storage_settings()
    if not cfg.is_enabled:
        raise ServerBackupError("Cloud storage is disabled. Please enable and configure it in the 'Free Cloud Setup' tab.")

    results = []
    for fname in DOWNLOADABLE_FILES:
        target = folder / fname
        if target.is_file():
            cloud_key = f"subidha-backups/{name}/{fname}"
            ok, msg = upload_file_to_cloud(target, cloud_key, cfg)
            results.append({"file": fname, "success": ok, "message": msg})

    return {
        "backup": name,
        "results": results,
        "all_successful": all(r["success"] for r in results) if results else False,
    }


def create_and_sync_backup(*, include_database: bool = True) -> dict[str, Any]:
    backup = create_backup(include_database=include_database)
    cloud_result = None
    cfg = get_or_create_cloud_storage_settings()
    if cfg.is_enabled:
        cloud_result = sync_backup_to_cloud(backup["name"])
    return {
        "backup": backup,
        "cloud_sync": cloud_result,
    }


# -------------------------------------------------------------------------
# Free Storage Maintenance & Cleanup
# -------------------------------------------------------------------------

def get_storage_maintenance_stats() -> dict[str, Any]:
    now = timezone.now()
    expired_tokens_count = 0
    try:
        from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
        expired_tokens_count = OutstandingToken.objects.filter(expires_at__lt=now).count()
    except Exception:
        pass

    expired_sessions_count = 0
    try:
        from django.contrib.sessions.models import Session
        expired_sessions_count = Session.objects.filter(expire_date__lt=now).count()
    except Exception:
        pass

    db_stats: dict[str, Any] = {"vendor": connection.vendor, "size_formatted": "—", "tables": []}
    if connection.vendor == "postgresql":
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_size_pretty(pg_database_size(current_database()));")
                row = cursor.fetchone()
                if row:
                    db_stats["size_formatted"] = row[0]

                cursor.execute("""
                    SELECT relname,
                           pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
                           n_live_tup, n_dead_tup
                    FROM pg_stat_user_tables
                    ORDER BY pg_total_relation_size(relid) DESC
                    LIMIT 8;
                """)
                db_stats["tables"] = [
                    {"table": r[0], "size": r[1], "live_rows": r[2], "dead_rows": r[3]}
                    for r in cursor.fetchall()
                ]
        except Exception:
            pass
    elif connection.vendor == "sqlite":
        try:
            db_path = settings.DATABASES["default"].get("NAME")
            if db_path and os.path.isfile(db_path):
                db_stats["size_formatted"] = f"{round(os.path.getsize(db_path) / (1024 * 1024), 2)} MB"
        except Exception:
            pass

    return {
        "expired_tokens_count": expired_tokens_count,
        "expired_sessions_count": expired_sessions_count,
        "database": db_stats,
    }


def run_storage_maintenance_cleanup(
    *,
    prune_tokens: bool = True,
    prune_sessions: bool = True,
    run_vacuum: bool = False,
) -> dict[str, Any]:
    before_stats = get_storage_maintenance_stats()
    actions_taken = []

    if prune_tokens:
        try:
            call_command("flushexpiredtokens")
            actions_taken.append("Flushed expired JWT tokens.")
        except Exception as exc:
            actions_taken.append(f"flushexpiredtokens note: {str(exc)[:100]}")

    if prune_sessions:
        try:
            call_command("clearsessions")
            actions_taken.append("Cleared expired Django sessions.")
        except Exception as exc:
            actions_taken.append(f"clearsessions note: {str(exc)[:100]}")

    if run_vacuum and connection.vendor == "postgresql":
        try:
            old_autocommit = connection.autocommit
            connection.set_autocommit(True)
            with connection.cursor() as cursor:
                cursor.execute("VACUUM (ANALYZE);")
            connection.set_autocommit(old_autocommit)
            actions_taken.append("Executed PostgreSQL VACUUM (ANALYZE) to reclaim dead space.")
        except Exception as exc:
            actions_taken.append(f"Vacuum note: {str(exc)[:100]}")

    after_stats = get_storage_maintenance_stats()

    return {
        "success": True,
        "actions_taken": actions_taken,
        "before": before_stats,
        "after": after_stats,
    }


# -------------------------------------------------------------------------
# Closed Batch Archival Helper
# -------------------------------------------------------------------------

def list_completed_batches_for_archive() -> list[dict[str, Any]]:
    from lucky_plan.models import Batch
    from subscriptions.models import Subscription

    batches = Batch.objects.all().order_by("-start_date", "-id")[:50]
    results = []
    for b in batches:
        sub_count = Subscription.objects.filter(batch_id=b.id).count()
        results.append({
            "id": b.id,
            "batch_code": b.batch_code,
            "duration_months": b.duration_months,
            "total_slots": b.total_slots,
            "start_date": b.start_date.isoformat() if b.start_date else None,
            "status": b.status,
            "subscription_count": sub_count,
        })
    return results


def export_batch_archive(batch_id: int, push_to_cloud: bool = False) -> dict[str, Any]:
    from lucky_plan.models import Batch, LuckyDraw
    from subscriptions.models import Emi, Payment, Subscription

    try:
        batch = Batch.objects.get(id=batch_id)
    except Batch.DoesNotExist:
        raise ServerBackupError("Batch not found.")

    subs = Subscription.objects.filter(batch_id=batch.id).select_related("customer", "product")
    sub_ids = list(subs.values_list("id", flat=True))

    emis = Emi.objects.filter(subscription_id__in=sub_ids)
    payments = Payment.objects.filter(subscription_id__in=sub_ids)
    draws = LuckyDraw.objects.filter(batch=batch)

    archive_data = {
        "archive_version": "1.0",
        "exported_at": timezone.now().isoformat(),
        "batch": {
            "id": batch.id,
            "batch_code": batch.batch_code,
            "duration_months": batch.duration_months,
            "total_slots": batch.total_slots,
            "start_date": batch.start_date.isoformat() if batch.start_date else None,
            "status": batch.status,
        },
        "subscriptions": [
            {
                "id": s.id,
                "subscription_number": s.subscription_number,
                "customer_name": getattr(s.customer, "name", ""),
                "customer_phone": getattr(s.customer, "phone", ""),
                "product_name": getattr(s.product, "name", ""),
                "status": s.status,
                "total_contract_amount": str(s.total_contract_amount),
                "monthly_amount": str(s.monthly_amount),
                "lucky_id": getattr(s, "lucky_id", None),
            }
            for s in subs
        ],
        "emis": [
            {
                "id": e.id,
                "subscription_id": e.subscription_id,
                "installment_number": e.installment_number,
                "due_date": e.due_date.isoformat() if e.due_date else None,
                "amount": str(e.amount),
                "status": e.status,
            }
            for e in emis
        ],
        "payments": [
            {
                "id": p.id,
                "subscription_id": p.subscription_id,
                "payment_number": getattr(p, "payment_number", ""),
                "amount": str(p.amount),
                "method": getattr(p, "method", ""),
                "payment_date": getattr(p, "payment_date", getattr(p, "created_at", timezone.now())).isoformat(),
            }
            for p in payments
        ],
        "lucky_draws": [
            {
                "id": d.id,
                "draw_number": getattr(d, "draw_number", None),
                "draw_date": d.draw_date.isoformat() if getattr(d, "draw_date", None) else None,
                "winner_subscription_id": getattr(d, "winner_subscription_id", None),
                "winner_status": getattr(d, "winner_status", None),
            }
            for d in draws
        ],
    }

    archive_dir = backup_root() / "archives"
    archive_dir.mkdir(parents=True, exist_ok=True)

    filename = f"batch_{re.sub(r'[^A-Za-z0-9_-]', '_', batch.batch_code)}_{datetime.now().strftime('%Y%m%d-%H%M%S')}.json.gz"
    dest_path = archive_dir / filename

    raw_json = json.dumps(archive_data, indent=2).encode("utf-8")
    with gzip.open(dest_path, "wb") as gz:
        gz.write(raw_json)

    cloud_msg = None
    if push_to_cloud:
        cloud_key = f"subidha-archives/{filename}"
        ok, cloud_msg = upload_file_to_cloud(dest_path, cloud_key)

    return {
        "filename": filename,
        "size_bytes": dest_path.stat().st_size,
        "records_count": {
            "subscriptions": len(subs),
            "emis": len(emis),
            "payments": len(payments),
            "lucky_draws": len(draws),
        },
        "cloud_sync_message": cloud_msg,
    }

