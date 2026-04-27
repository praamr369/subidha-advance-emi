from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence

from django.apps import apps
from django.contrib.auth import get_user_model
from django.db import connection, transaction


RESET_CONFIRMATION = "RESET_SUBIDHA_CORE"


DEFAULT_TARGET_APP_LABELS: set[str] = {
    "branch_control",
    "crm",
    "service_desk",
    "accounting",
    "inventory",
    "manufacturing",
    "billing",
    "reminders",
    "subscriptions",
    "accounts",
}


AUTH_ARTIFACT_MODEL_LABELS: set[str] = {
    "sessions.Session",
    "token_blacklist.OutstandingToken",
    "token_blacklist.BlacklistedToken",
    "accounts.PasswordResetRequest",
}


@dataclass(frozen=True)
class BusinessResetOptions:
    preserve_usernames: tuple[str, ...]
    preserve_user_ids: tuple[int, ...] = ()
    preserve_superusers: bool = True
    delete_non_preserved_users: bool = False
    clear_auth_artifacts: bool = True
    target_app_labels: tuple[str, ...] = tuple(sorted(DEFAULT_TARGET_APP_LABELS))


def _quote_table(table_name: str) -> str:
    return connection.ops.quote_name(table_name)


def _resolve_models_for_apps(*, app_labels: Iterable[str], excluded_model_labels: set[str]) -> list[type]:
    resolved: list[type] = []
    seen = set()

    for model in apps.get_models():
        if model._meta.app_label not in set(app_labels):
            continue
        label = model._meta.label
        if label in excluded_model_labels:
            continue
        if label in seen:
            continue
        seen.add(label)
        resolved.append(model)

    return resolved


def _resolve_auth_artifact_models() -> list[type]:
    resolved: list[type] = []
    seen = set()

    for model in apps.get_models():
        label = model._meta.label
        if label in AUTH_ARTIFACT_MODEL_LABELS and label not in seen:
            seen.add(label)
            resolved.append(model)

    return resolved


def build_business_reset_plan(*, options: BusinessResetOptions) -> dict:
    User = get_user_model()

    preserved_user_ids: set[int] = set(int(value) for value in options.preserve_user_ids or ())
    preserved_usernames = [value.strip() for value in options.preserve_usernames or () if value and value.strip()]

    if options.preserve_superusers:
        preserved_user_ids |= set(User.objects.filter(is_superuser=True).values_list("id", flat=True))

    if preserved_usernames:
        preserved_user_ids |= set(
            User.objects.filter(username__in=preserved_usernames).values_list("id", flat=True)
        )

    preserved_users = list(
        User.objects.filter(id__in=preserved_user_ids)
        .order_by("id")
        .values("id", "username", "email", "is_superuser", "is_active")
    )

    # Exclude the user table from truncation; delete users explicitly if requested.
    excluded_model_labels = {"accounts.User"}

    target_models = _resolve_models_for_apps(
        app_labels=options.target_app_labels,
        excluded_model_labels=excluded_model_labels,
    )
    auth_models = _resolve_auth_artifact_models() if options.clear_auth_artifacts else []

    model_counts: list[dict] = []
    total_rows = 0
    for model in target_models:
        count = model.objects.count()
        model_counts.append(
            {
                "label": model._meta.label,
                "db_table": model._meta.db_table,
                "count": count,
            }
        )
        total_rows += count

    auth_counts: list[dict] = []
    auth_total = 0
    for model in auth_models:
        count = model.objects.count()
        auth_counts.append(
            {
                "label": model._meta.label,
                "db_table": model._meta.db_table,
                "count": count,
            }
        )
        auth_total += count

    deletable_user_count = 0
    if options.delete_non_preserved_users:
        deletable_user_count = User.objects.exclude(id__in=preserved_user_ids).count()

    return {
        "confirmation_required": RESET_CONFIRMATION,
        "options": {
            "preserve_usernames": preserved_usernames,
            "preserve_user_ids": sorted(preserved_user_ids),
            "preserve_superusers": bool(options.preserve_superusers),
            "delete_non_preserved_users": bool(options.delete_non_preserved_users),
            "clear_auth_artifacts": bool(options.clear_auth_artifacts),
            "target_app_labels": list(options.target_app_labels),
        },
        "preserved_users": preserved_users,
        "deletable_user_count": deletable_user_count,
        "targets": {
            "model_count": len(target_models),
            "total_rows": total_rows,
            "models": model_counts,
        },
        "auth_artifacts": {
            "enabled": bool(options.clear_auth_artifacts),
            "model_count": len(auth_models),
            "total_rows": auth_total,
            "models": auth_counts,
        },
    }


def execute_business_reset(*, options: BusinessResetOptions, confirm: str, dry_run: bool = False) -> dict:
    if not dry_run and (confirm or "").strip() != RESET_CONFIRMATION:
        raise ValueError(f"Reset blocked. Provide confirm={RESET_CONFIRMATION}.")

    User = get_user_model()

    preserved_usernames = [value.strip() for value in options.preserve_usernames or () if value and value.strip()]
    if not preserved_usernames and not options.preserve_superusers and not options.preserve_user_ids:
        raise ValueError("No preserved users configured. Refusing to reset without a preserved admin user.")

    # Resolve preserved users *before* truncation.
    plan = build_business_reset_plan(options=options)
    preserved_user_ids = set(plan["options"]["preserve_user_ids"] or [])

    if preserved_usernames and not preserved_user_ids:
        raise ValueError("Preserved username(s) not found. Refusing to reset.")

    if dry_run:
        return {**plan, "mode": "dry_run"}

    excluded_model_labels = {"accounts.User"}
    target_models = _resolve_models_for_apps(
        app_labels=options.target_app_labels,
        excluded_model_labels=excluded_model_labels,
    )
    auth_models = _resolve_auth_artifact_models() if options.clear_auth_artifacts else []

    with transaction.atomic():
        if connection.vendor == "postgresql":
            tables = [_quote_table(model._meta.db_table) for model in target_models]
            if tables:
                with connection.cursor() as cursor:
                    cursor.execute(
                        f"TRUNCATE TABLE {', '.join(tables)} RESTART IDENTITY CASCADE;"
                    )
            if options.clear_auth_artifacts and auth_models:
                auth_tables = [_quote_table(model._meta.db_table) for model in auth_models]
                with connection.cursor() as cursor:
                    cursor.execute(
                        f"TRUNCATE TABLE {', '.join(auth_tables)} RESTART IDENTITY CASCADE;"
                    )
        else:
            # SQLite and other lightweight DBs can raise ProtectedError during ORM
            # cascade order resolution. Use table-level deletes to keep reset behavior
            # aligned with the PostgreSQL truncate path.
            tables = [model._meta.db_table for model in target_models]
            if options.clear_auth_artifacts:
                tables.extend(model._meta.db_table for model in auth_models)
            with connection.cursor() as cursor:
                if connection.vendor == "sqlite":
                    cursor.execute("PRAGMA foreign_keys = OFF;")
                for table in tables:
                    cursor.execute(f"DELETE FROM {_quote_table(table)};")
                if connection.vendor == "sqlite":
                    cursor.execute("PRAGMA foreign_keys = ON;")

        if options.delete_non_preserved_users:
            User.objects.exclude(id__in=preserved_user_ids).delete()

        # Ensure preserved admins remain active and privileged enough to re-enter setup.
        User.objects.filter(id__in=preserved_user_ids).update(is_active=True, is_staff=True)

    return {**build_business_reset_plan(options=options), "mode": "executed"}

