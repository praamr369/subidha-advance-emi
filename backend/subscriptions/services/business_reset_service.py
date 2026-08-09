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
    # Apps the subscriptions monolith was split into — the operational data
    # (customers, contracts, payments, lucky-plan, deliveries, etc.) now lives
    # here, so they must be cleared too or User deletion hits their PROTECT FKs.
    "customers",
    "contracts",
    "payments",
    "lucky_plan",
    "deliveries",
    "commissions",
    "growth",
    "business_setup",
    "finance_control",
    "audit",
    "products_core",
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


def _fk_safe_delete_tables(target_models: list[type], *, excluded_model_labels: set[str]) -> list[str]:
    """Ordered db_tables for the SQLite delete path.

    SQLite ignores ``PRAGMA foreign_keys=OFF`` inside a transaction, so the raw
    DELETEs run with FK enforcement on. To emulate PostgreSQL's
    ``TRUNCATE ... CASCADE`` we (1) expand the target set with every model that
    transitively FK-references it, then (2) topologically sort so a referencing
    table is deleted before the table it points at. accounts.User is excluded —
    it is deleted separately after its referencers are gone.
    """
    all_models = list(apps.get_models())
    referencers: dict[type, set[type]] = {}
    for model in all_models:
        for field in model._meta.get_fields():
            if getattr(field, "concrete", False) and (field.many_to_one or field.one_to_one) and field.related_model:
                referencers.setdefault(field.related_model, set()).add(model)

    expanded: set[type] = set(target_models)
    stack = list(target_models)
    while stack:
        current = stack.pop()
        for ref in referencers.get(current, ()):
            if ref not in expanded:
                expanded.add(ref)
                stack.append(ref)

    expanded = {m for m in expanded if m._meta.label not in excluded_model_labels}

    # deps[model] = models that must be deleted before it (its referencers).
    deps: dict[type, set[type]] = {m: set() for m in expanded}
    for model in expanded:
        for field in model._meta.get_fields():
            if getattr(field, "concrete", False) and (field.many_to_one or field.one_to_one):
                parent = field.related_model
                if parent in expanded and parent is not model:
                    deps[parent].add(model)

    ordered: list[type] = []
    emitted: set[type] = set()
    remaining = list(expanded)
    while remaining:
        progressed = False
        for model in list(remaining):
            if deps[model] <= emitted:
                ordered.append(model)
                emitted.add(model)
                remaining.remove(model)
                progressed = True
        if not progressed:  # cycle — append the rest as-is
            ordered.extend(remaining)
            break

    # De-dup db_tables (multiple models can share a table) preserving order.
    tables: list[str] = []
    seen_tables: set[str] = set()
    for model in ordered:
        t = model._meta.db_table
        if t not in seen_tables:
            seen_tables.add(t)
            tables.append(t)
    return tables


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
            # Non-PostgreSQL path (SQLite in tests). PRAGMA foreign_keys=OFF is a
            # no-op inside a transaction, so emulate TRUNCATE ... CASCADE: expand
            # to referencing tables and delete referencing-before-referenced.
            tables = _fk_safe_delete_tables(target_models, excluded_model_labels=excluded_model_labels)
            if options.clear_auth_artifacts:
                for model in auth_models:
                    if model._meta.db_table not in tables:
                        tables.append(model._meta.db_table)
            with connection.cursor() as cursor:
                for table in tables:
                    cursor.execute(f"DELETE FROM {_quote_table(table)};")

        if options.delete_non_preserved_users:
            User.objects.exclude(id__in=preserved_user_ids).delete()

        # Ensure preserved admins remain active and privileged enough to re-enter setup.
        User.objects.filter(id__in=preserved_user_ids).update(is_active=True, is_staff=True)

    return {**build_business_reset_plan(options=options), "mode": "executed"}

