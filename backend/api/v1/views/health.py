import logging
import time
from pathlib import Path

from django.conf import settings
from django.core.cache import cache
from django.db import DEFAULT_DB_ALIAS, connections
from django.db.migrations.executor import MigrationExecutor
from django.db.utils import DatabaseError, OperationalError, ProgrammingError
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from system_jobs.models import SystemJobLog

logger = logging.getLogger("api.health")


def _include_details() -> bool:
    return bool(getattr(settings, "HEALTHCHECK_INCLUDE_DETAILS", settings.DEBUG))


def _check_migrations_enabled() -> bool:
    return bool(
        getattr(settings, "HEALTHCHECK_CHECK_MIGRATIONS", not settings.DEBUG)
    )


def _db_alias() -> str:
    return str(getattr(settings, "HEALTHCHECK_DB_ALIAS", DEFAULT_DB_ALIAS))


def _serialize_exception(exc: Exception) -> str:
    if _include_details():
        return str(exc)
    return exc.__class__.__name__


def _database_check(alias: str) -> tuple[bool, dict]:
    started = time.monotonic()
    try:
        connection = connections[alias]
        connection.ensure_connection()
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except (OperationalError, DatabaseError) as exc:
        logger.warning("Database readiness check failed")
        return False, {
            "status": "error",
            "alias": alias,
            "error": _serialize_exception(exc),
        }
    except Exception as exc:  # pragma: no cover - defensive endpoint guard
        logger.exception("Unexpected readiness database connectivity check failure")
        return False, {
            "status": "error",
            "alias": alias,
            "error": _serialize_exception(exc),
        }

    elapsed_ms = int((time.monotonic() - started) * 1000)
    return True, {
        "status": "ok",
        "alias": alias,
        "latency_ms": elapsed_ms,
    }


def _migration_check(alias: str) -> tuple[bool, dict]:
    if not _check_migrations_enabled():
        return True, {
            "status": "skipped",
            "alias": alias,
            "reason": "disabled",
        }

    try:
        executor = MigrationExecutor(connections[alias])
        targets = executor.loader.graph.leaf_nodes()
        plan = executor.migration_plan(targets)
    except (OperationalError, ProgrammingError) as exc:
        logger.warning("Migration readiness check failed")
        return False, {
            "status": "error",
            "alias": alias,
            "error": _serialize_exception(exc),
        }
    except Exception as exc:  # pragma: no cover - defensive endpoint guard
        logger.exception("Unexpected readiness migration check failure")
        return False, {
            "status": "error",
            "alias": alias,
            "error": _serialize_exception(exc),
        }

    if plan:
        pending = [f"{migration.app_label}.{migration.name}" for migration, _ in plan]
        payload = {
            "status": "pending",
            "alias": alias,
            "pending_count": len(pending),
        }
        if _include_details():
            payload["pending"] = pending[:20]
        return False, payload

    return True, {
        "status": "ok",
        "alias": alias,
        "pending_count": 0,
    }


def _cache_check() -> tuple[bool, dict]:
    probe_key = "health:cache:probe"
    probe_value = str(time.time())
    try:
        cache.set(probe_key, probe_value, timeout=30)
        echoed = cache.get(probe_key)
    except Exception as exc:  # pragma: no cover
        logger.warning("Readiness cache check failed", exc_info=True)
        return False, {"status": "error", "error": _serialize_exception(exc)}
    if echoed != probe_value:
        return False, {"status": "error", "error": "cache_echo_mismatch"}
    return True, {"status": "ok"}


def _worker_heartbeat_check() -> tuple[bool, dict]:
    broker = (getattr(settings, "CELERY_BROKER_URL", "") or "").strip()
    jobs_enabled = bool(broker)
    if not jobs_enabled:
        return True, {"status": "skipped", "reason": "background_jobs_disabled"}

    latest = (
        SystemJobLog.objects.exclude(started_at__isnull=True)
        .order_by("-started_at")
        .values("id", "job_type", "status", "started_at")
        .first()
    )
    if not latest:
        return False, {"status": "error", "error": "no_worker_heartbeat"}

    max_age = int(getattr(settings, "HEALTHCHECK_WORKER_HEARTBEAT_SECONDS", 900))
    age_seconds = int((timezone.now() - latest["started_at"]).total_seconds())
    if age_seconds > max_age:
        return False, {
            "status": "stale",
            "max_age_seconds": max_age,
            "age_seconds": age_seconds,
            "last_job_type": latest["job_type"],
            "last_status": latest["status"],
        }
    return True, {
        "status": "ok",
        "max_age_seconds": max_age,
        "age_seconds": age_seconds,
        "last_job_type": latest["job_type"],
        "last_status": latest["status"],
    }


def _storage_writable_check() -> tuple[bool, dict]:
    root = Path(getattr(settings, "MEDIA_ROOT", ""))
    if not root:
        return False, {"status": "error", "error": "media_root_not_configured"}
    try:
        root.mkdir(parents=True, exist_ok=True)
        probe = root / ".health-write-probe"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
    except Exception as exc:  # pragma: no cover
        logger.warning("Readiness storage check failed", exc_info=True)
        return False, {"status": "error", "path": str(root), "error": _serialize_exception(exc)}
    return True, {"status": "ok", "path": str(root)}


class PublicLivenessView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(
            {
                "status": "ok",
                "service": "subidha-advance-emi-backend",
                "environment": getattr(settings, "ENVIRONMENT_NAME", None)
                or ("development" if settings.DEBUG else "production"),
            },
            status=status.HTTP_200_OK,
        )


class PublicReadinessView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        alias = _db_alias()
        db_ok, db_payload = _database_check(alias)
        migration_ok, migration_payload = _migration_check(alias) if db_ok else (
            False,
            {
                "status": "skipped",
                "alias": alias,
                "reason": "database_check_failed",
            },
        )

        ready = db_ok and migration_ok
        response_status = status.HTTP_200_OK if ready else status.HTTP_503_SERVICE_UNAVAILABLE

        return Response(
            {
                "status": "ready" if ready else "not_ready",
                "service": "subidha-advance-emi-backend",
                "checks": {
                    "database": db_payload,
                    "migrations": migration_payload,
                },
            },
            status=response_status,
        )


class PublicApiHealthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(
            {
                "status": "ok",
                "service": "subidha-advance-emi-backend",
                "api": "v1",
            },
            status=status.HTTP_200_OK,
        )


class PublicApiDeepHealthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        alias = _db_alias()
        checks: dict[str, dict] = {}

        db_ok, checks["database"] = _database_check(alias)
        if db_ok:
            migrations_ok, checks["migrations"] = _migration_check(alias)
        else:
            migrations_ok, checks["migrations"] = False, {
                "status": "skipped",
                "reason": "database_check_failed",
            }
        cache_ok, checks["cache"] = _cache_check()
        worker_ok, checks["worker_heartbeat"] = _worker_heartbeat_check()
        storage_ok, checks["storage_writable"] = _storage_writable_check()

        healthy = db_ok and migrations_ok and cache_ok and worker_ok and storage_ok
        return Response(
            {
                "status": "healthy" if healthy else "degraded",
                "service": "subidha-advance-emi-backend",
                "checks": checks,
            },
            status=status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE,
        )
