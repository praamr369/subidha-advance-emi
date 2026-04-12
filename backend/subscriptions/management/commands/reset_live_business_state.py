from __future__ import annotations

import os
from typing import Iterable, List, Sequence

from django.apps import apps
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from accounting.models import (
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    FinanceAccountKind,
)

RESET_CONFIRMATION = "RESET_SUBIDHA_CORE"

TARGET_APP_LABELS = {
    "subscriptions",
    "billing",
    "inventory",
    "reminders",
    "accounting",
}

AUTH_ARTIFACT_MODEL_LABELS = {
    "accounts.PasswordResetRequest",
    "sessions.Session",
    "token_blacklist.OutstandingToken",
    "token_blacklist.BlacklistedToken",
}


def quote_table(table_name: str) -> str:
    return connection.ops.quote_name(table_name)


def resolve_models_for_reset(*, keep_finance_masters: bool) -> List[type]:
    preserved_labels = {"accounts.User"}
    if keep_finance_masters:
        preserved_labels |= {
            "accounting.ChartOfAccount",
            "accounting.FinanceAccount",
        }

    resolved: List[type] = []
    seen = set()

    for model in apps.get_models():
        label = model._meta.label
        if model._meta.app_label not in TARGET_APP_LABELS:
            continue
        if label in preserved_labels:
            continue
        if label in seen:
            continue
        seen.add(label)
        resolved.append(model)

    return resolved


def resolve_auth_artifact_models() -> List[type]:
    resolved: List[type] = []
    seen = set()

    for model in apps.get_models():
        label = model._meta.label
        if label in AUTH_ARTIFACT_MODEL_LABELS and label not in seen:
            seen.add(label)
            resolved.append(model)

    return resolved


def env_required(name: str) -> str:
    value = (os.getenv(name) or "").strip()
    if not value:
        raise CommandError(f"Required environment variable is missing or blank: {name}")
    return value


def ensure_asset_chart_account(*, system_code: str, code: str, name: str) -> ChartOfAccount:
    account, _ = ChartOfAccount.objects.update_or_create(
        system_code=system_code,
        defaults={
            "code": code,
            "name": name,
            "account_type": ChartOfAccountType.ASSET,
            "is_active": True,
            "allow_manual_posting": True,
        },
    )
    return account


def upsert_finance_account(
    *,
    name: str,
    kind: str,
    chart_system_code: str,
    chart_code: str,
    chart_name: str,
    bank_last4: str = "",
    upi_handle: str = "",
) -> FinanceAccount:
    chart_account = ensure_asset_chart_account(
        system_code=chart_system_code,
        code=chart_code,
        name=chart_name,
    )

    finance_account, _ = FinanceAccount.objects.update_or_create(
        name=name,
        kind=kind,
        defaults={
            "chart_account": chart_account,
            "opening_balance": "0.00",
            "is_active": True,
            "bank_last4": (bank_last4 or "").strip(),
            "upi_handle": (upi_handle or "").strip(),
        },
    )
    return finance_account


class Command(BaseCommand):
    help = (
        "Reset SUBIDHA CORE to a fresh operational state while preserving admin access "
        "and, by default, preserving finance master accounts."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--keep-user-ids",
            nargs="*",
            type=int,
            default=[],
            help="Additional user IDs to preserve besides superusers.",
        )
        parser.add_argument(
            "--delete-non-kept-users",
            action="store_true",
            help="Delete all users except preserved users.",
        )
        parser.add_argument(
            "--clear-auth-artifacts",
            action="store_true",
            help="Clear sessions, JWT token artifacts, and password reset requests.",
        )
        parser.add_argument(
            "--purge-finance-masters",
            action="store_true",
            help="Also purge ChartOfAccount and FinanceAccount. Default keeps them.",
        )
        parser.add_argument(
            "--admin-user-id",
            type=int,
            default=None,
            help="Admin user ID to preserve and re-seed after reset.",
        )
        parser.add_argument(
            "--admin-username",
            type=str,
            default="",
            help="Username to set on preserved admin after reset.",
        )
        parser.add_argument(
            "--admin-email",
            type=str,
            default="",
            help="Email to set on preserved admin after reset.",
        )
        parser.add_argument(
            "--admin-phone",
            type=str,
            default="",
            help="Phone to set on preserved admin after reset.",
        )
        parser.add_argument(
            "--admin-password-env",
            type=str,
            default="",
            help="Environment variable containing the admin password.",
        )
        parser.add_argument(
            "--ensure-cash-account",
            action="store_true",
            help="Ensure a cash finance account exists after reset.",
        )
        parser.add_argument(
            "--cash-account-name",
            type=str,
            default="Cash in Hand",
            help="Cash finance account display name.",
        )
        parser.add_argument(
            "--ensure-bank-account",
            action="store_true",
            help="Ensure a bank finance account exists after reset.",
        )
        parser.add_argument(
            "--bank-account-name",
            type=str,
            default="Main Bank",
            help="Bank finance account display name.",
        )
        parser.add_argument(
            "--bank-last4-env",
            type=str,
            default="",
            help="Environment variable containing bank last 4 digits.",
        )
        parser.add_argument(
            "--ensure-upi-account",
            action="store_true",
            help="Ensure a UPI finance account exists after reset.",
        )
        parser.add_argument(
            "--upi-account-name",
            type=str,
            default="Main UPI",
            help="UPI finance account display name.",
        )
        parser.add_argument(
            "--upi-handle-env",
            type=str,
            default="",
            help="Environment variable containing UPI handle.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be deleted without actually deleting anything.",
        )
        parser.add_argument(
            "--confirm",
            type=str,
            default="",
            help=f"Required confirmation string: {RESET_CONFIRMATION}",
        )

    def handle(self, *args, **options):
        dry_run: bool = options["dry_run"]
        keep_finance_masters: bool = not options["purge_finance_masters"]
        keep_user_ids: Sequence[int] = options["keep_user_ids"] or []
        delete_non_kept_users: bool = options["delete_non_kept_users"]
        clear_auth_artifacts: bool = options["clear_auth_artifacts"]
        admin_user_id = options["admin_user_id"]
        confirm = (options["confirm"] or "").strip()

        if not dry_run and confirm != RESET_CONFIRMATION:
            raise CommandError(
                f"Reset blocked. Re-run with --confirm {RESET_CONFIRMATION}"
            )

        target_models = resolve_models_for_reset(
            keep_finance_masters=keep_finance_masters
        )
        auth_models = resolve_auth_artifact_models()

        if not target_models:
            raise CommandError("No reset target models resolved.")

        User = get_user_model()

        superuser_ids = set(
            User.objects.filter(is_superuser=True).values_list("id", flat=True)
        )
        preserved_user_ids = set(keep_user_ids) | superuser_ids
        if admin_user_id:
            preserved_user_ids.add(admin_user_id)

        preserved_users = list(
            User.objects.filter(id__in=preserved_user_ids)
            .order_by("id")
            .values("id", "username", "email", "is_superuser")
        )

        deletable_user_qs = User.objects.exclude(id__in=preserved_user_ids)
        deletable_user_count = deletable_user_qs.count() if delete_non_kept_users else 0

        target_counts = []
        total_target_rows = 0
        for model in target_models:
            count = model.objects.count()
            target_counts.append((model._meta.label, count))
            total_target_rows += count

        auth_counts = []
        total_auth_rows = 0
        if clear_auth_artifacts:
            for model in auth_models:
                count = model.objects.count()
                auth_counts.append((model._meta.label, count))
                total_auth_rows += count

        self.stdout.write("")
        self.stdout.write(self.style.WARNING("SUBIDHA CORE fresh-start plan"))
        self.stdout.write("-" * 72)
        self.stdout.write(f"Operational/business rows to remove: {total_target_rows}")
        for label, count in target_counts:
            self.stdout.write(f"  - {label}: {count}")

        if clear_auth_artifacts:
            self.stdout.write(f"Auth artifact rows to remove: {total_auth_rows}")
            for label, count in auth_counts:
                self.stdout.write(f"  - {label}: {count}")

        self.stdout.write(f"Preserved users: {len(preserved_user_ids)}")
        for user in preserved_users:
            suffix = " [superuser]" if user["is_superuser"] else ""
            self.stdout.write(
                f"  - id={user['id']} username={user['username']} email={user['email']}{suffix}"
            )

        if delete_non_kept_users:
            self.stdout.write(f"Non-preserved users to delete: {deletable_user_count}")
        else:
            self.stdout.write("Non-preserved users: kept")

        self.stdout.write(
            f"Finance master preservation: {'ON' if keep_finance_masters else 'OFF'}"
        )

        if dry_run:
            self.stdout.write("")
            self.stdout.write(self.style.SUCCESS("Dry run complete. No data was deleted."))
            return

        with transaction.atomic():
            if connection.vendor == "postgresql":
                tables = [quote_table(model._meta.db_table) for model in target_models]
                with connection.cursor() as cursor:
                    cursor.execute(
                        f"TRUNCATE TABLE {', '.join(tables)} RESTART IDENTITY CASCADE;"
                    )

                if clear_auth_artifacts and auth_models:
                    auth_tables = [quote_table(model._meta.db_table) for model in auth_models]
                    with connection.cursor() as cursor:
                        cursor.execute(
                            f"TRUNCATE TABLE {', '.join(auth_tables)} RESTART IDENTITY CASCADE;"
                        )
            else:
                for model in target_models:
                    model.objects.all().delete()

                if clear_auth_artifacts:
                    for model in auth_models:
                        model.objects.all().delete()

            if delete_non_kept_users:
                deletable_user_qs.delete()

            admin_user = None
            if admin_user_id:
                admin_user = User.objects.filter(id=admin_user_id).first()
                if admin_user is None:
                    raise CommandError(
                        f"Preserved admin user not found after reset: id={admin_user_id}"
                    )
            elif superuser_ids:
                admin_user = User.objects.filter(id__in=superuser_ids).order_by("id").first()

            if admin_user:
                if options["admin_username"]:
                    admin_user.username = options["admin_username"].strip()
                if options["admin_email"]:
                    admin_user.email = options["admin_email"].strip()
                if options["admin_phone"]:
                    admin_user.phone = options["admin_phone"].strip()

                if hasattr(admin_user, "role"):
                    admin_user.role = "ADMIN"

                admin_user.is_active = True
                admin_user.is_staff = True
                admin_user.is_superuser = True

                password_env_name = (options["admin_password_env"] or "").strip()
                if password_env_name:
                    admin_password = env_required(password_env_name)
                    admin_user.set_password(admin_password)

                admin_user.save()

            if keep_finance_masters:
                if options["ensure_cash_account"]:
                    upsert_finance_account(
                        name=(options["cash_account_name"] or "Cash in Hand").strip(),
                        kind=FinanceAccountKind.CASH,
                        chart_system_code="OPERATING_CASH",
                        chart_code="CASH-1000",
                        chart_name="Cash in Hand",
                    )

                if options["ensure_bank_account"]:
                    bank_last4_env = (options["bank_last4_env"] or "").strip()
                    bank_last4 = env_required(bank_last4_env) if bank_last4_env else ""
                    upsert_finance_account(
                        name=(options["bank_account_name"] or "Main Bank").strip(),
                        kind=FinanceAccountKind.BANK,
                        chart_system_code="OPERATING_BANK",
                        chart_code="BANK-1000",
                        chart_name="Operating Bank Account",
                        bank_last4=bank_last4,
                    )

                if options["ensure_upi_account"]:
                    upi_handle_env = (options["upi_handle_env"] or "").strip()
                    upi_handle = env_required(upi_handle_env) if upi_handle_env else ""
                    upsert_finance_account(
                        name=(options["upi_account_name"] or "Main UPI").strip(),
                        kind=FinanceAccountKind.UPI,
                        chart_system_code="OPERATING_UPI",
                        chart_code="UPI-1000",
                        chart_name="Operating UPI Account",
                        upi_handle=upi_handle,
                    )

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS("Fresh-start reset completed successfully.")
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Preserved user IDs: {sorted(preserved_user_ids) if preserved_user_ids else []}"
            )
        )