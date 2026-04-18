from __future__ import annotations

from typing import List

from django.core.management.base import BaseCommand, CommandError

from subscriptions.services.business_reset_service import (
    BusinessResetOptions,
    RESET_CONFIRMATION,
    build_business_reset_plan,
    execute_business_reset,
)


class Command(BaseCommand):
    help = (
        "Hard reset SUBIDHA CORE business data with an explicit preservation allowlist "
        "for internal admin access. By default this preserves all superusers; use "
        "--no-preserve-superusers with --keep-usernames to preserve only a specific admin "
        "(recommended for first-run go-live reset). This command is designed for a "
        "controlled first-run reset path (not a dropdb shortcut)."
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
            "--keep-usernames",
            nargs="*",
            type=str,
            default=[],
            help="Usernames to preserve. Combine with --no-preserve-superusers to preserve only these usernames.",
        )
        parser.add_argument(
            "--no-preserve-superusers",
            action="store_true",
            help="Do not automatically preserve all superusers (use with caution).",
        )
        parser.add_argument(
            "--delete-non-kept-users",
            action="store_true",
            help=(
                "Also delete non-preserved users after business data reset. "
                "Use this only when you want to remove customer/partner/cashier users too."
            ),
        )
        parser.add_argument(
            "--clear-auth-artifacts",
            action="store_true",
            help=(
                "Also clear sessions and JWT blacklist/outstanding token tables if present."
            ),
        )
        parser.add_argument(
            "--plan-only",
            action="store_true",
            help="Print the computed reset plan and exit (like dry-run, but includes full model list).",
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
        plan_only: bool = options["plan_only"]
        keep_user_ids: List[int] = options["keep_user_ids"] or []
        keep_usernames: List[str] = options["keep_usernames"] or []
        delete_non_kept_users: bool = options["delete_non_kept_users"]
        clear_auth_artifacts: bool = options["clear_auth_artifacts"]
        confirm: str = (options["confirm"] or "").strip()
        preserve_superusers: bool = not bool(options["no_preserve_superusers"])

        reset_options = BusinessResetOptions(
            preserve_usernames=tuple(keep_usernames),
            preserve_user_ids=tuple(keep_user_ids),
            preserve_superusers=preserve_superusers,
            delete_non_preserved_users=delete_non_kept_users,
            clear_auth_artifacts=clear_auth_artifacts,
        )

        plan = build_business_reset_plan(options=reset_options)

        self.stdout.write("")
        self.stdout.write(self.style.WARNING("SUBIDHA CORE database reset plan"))
        self.stdout.write("-" * 72)
        self.stdout.write(f"Confirmation required: {plan['confirmation_required']}")
        self.stdout.write(
            f"Preserve superusers: {'YES' if plan['options']['preserve_superusers'] else 'NO'}"
        )
        self.stdout.write(f"Preserve usernames: {plan['options']['preserve_usernames']}")
        self.stdout.write(f"Preserved user IDs: {plan['options']['preserve_user_ids']}")
        self.stdout.write(f"Delete non-preserved users: {plan['options']['delete_non_preserved_users']}")
        self.stdout.write(f"Clear auth artifacts: {plan['options']['clear_auth_artifacts']}")
        self.stdout.write("")
        self.stdout.write(
            f"Target models: {plan['targets']['model_count']} (rows: {plan['targets']['total_rows']})"
        )
        for row in plan["targets"]["models"]:
            self.stdout.write(f"  - {row['label']}: {row['count']}")

        if plan["auth_artifacts"]["enabled"]:
            self.stdout.write(
                f"Auth artifacts: {plan['auth_artifacts']['model_count']} (rows: {plan['auth_artifacts']['total_rows']})"
            )
            for row in plan["auth_artifacts"]["models"]:
                self.stdout.write(f"  - {row['label']}: {row['count']}")

        self.stdout.write("")
        self.stdout.write(f"Preserved users ({len(plan['preserved_users'])}):")
        for user in plan["preserved_users"]:
            suffix = " [superuser]" if user.get("is_superuser") else ""
            self.stdout.write(f"  - id={user['id']} username={user['username']}{suffix}")

        if plan["options"]["delete_non_preserved_users"]:
            self.stdout.write(f"Non-preserved users to delete: {plan['deletable_user_count']}")
        else:
            self.stdout.write("Non-preserved users: kept")

        if plan_only or dry_run:
            self.stdout.write("")
            self.stdout.write(self.style.SUCCESS("Plan complete. No data was deleted."))
            return

        try:
            execute_business_reset(options=reset_options, confirm=confirm, dry_run=False)
        except ValueError as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Business data reset completed successfully."))
