import logging
import time

from django.conf import settings
from django.db import DEFAULT_DB_ALIAS, connections
from django.db.migrations.executor import MigrationExecutor
from django.db.utils import OperationalError, ProgrammingError
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

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
    except Exception as exc:  # pragma: no cover - defensive endpoint guard
        logger.warning("Readiness database connectivity check failed", exc_info=True)
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
        logger.warning("Readiness migration check failed", exc_info=True)
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
