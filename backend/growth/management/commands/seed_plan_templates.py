"""
Seed the PlanTemplate rows that drive public tenure options.

Without these the pricing engine falls back to built-in presets, which are fine
but are not editable without a deploy. Creating them as rows moves that control
into the admin screen at /admin/growth/plan-templates.

Two behaviours worth knowing before running this:

* Templates take priority over Lucky Plan batch durations for EMI tenures.
  Once EMI templates exist, creating batches will no longer change the tenures
  shown on the public site.
* ``default_security_deposit_percent`` is deliberately left empty on rent and
  lease. Setting it would override the price-banded deposit (20% under 20k,
  25% to 50k, 30% above) with a single flat percent.

Idempotent: existing template codes are left alone unless --update is passed.
Dry run by default.
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

TENURES = (6, 12, 24, 36)

PLAN_LABELS = {
    "EMI": "Advance EMI",
    "RENT": "Rent",
    "LEASE": "Lease",
}


class Command(BaseCommand):
    help = "Seed PlanTemplate rows for EMI, rent and lease tenure options."

    def add_arguments(self, parser):
        parser.add_argument(
            "--commit",
            action="store_true",
            help="Actually write. Without this the command only reports what it would do.",
        )
        parser.add_argument(
            "--update",
            action="store_true",
            help="Also reactivate and correct templates that already exist.",
        )
        parser.add_argument(
            "--plans",
            default="EMI,RENT,LEASE",
            help="Comma-separated plan types to seed (default: EMI,RENT,LEASE).",
        )
        parser.add_argument(
            "--tenures",
            default=",".join(str(t) for t in TENURES),
            help=f"Comma-separated tenures in months (default: {','.join(str(t) for t in TENURES)}).",
        )

    def handle(self, *args, **opts):
        from growth.models import PlanTemplate, PlanTemplateType

        valid_plans = {c for c, _ in PlanTemplateType.choices}
        plans = [p.strip().upper() for p in opts["plans"].split(",") if p.strip()]
        unknown = [p for p in plans if p not in valid_plans]
        if unknown:
            self.stderr.write(self.style.ERROR(f"Unknown plan type(s): {', '.join(unknown)}"))
            return

        try:
            tenures = sorted({int(t) for t in opts["tenures"].split(",") if t.strip()})
        except ValueError:
            self.stderr.write(self.style.ERROR("--tenures must be a comma-separated list of integers."))
            return
        if not tenures or any(t <= 0 for t in tenures):
            self.stderr.write(self.style.ERROR("--tenures must be positive integers."))
            return

        commit = opts["commit"]
        update = opts["update"]

        planned_create: list[tuple[str, str, int]] = []
        planned_update: list[str] = []
        unchanged: list[str] = []

        existing = {t.template_code: t for t in PlanTemplate.objects.all()}

        for plan in plans:
            for tenure in tenures:
                code = f"{plan}-{tenure:02d}"
                current = existing.get(code)
                if current is None:
                    planned_create.append((code, plan, tenure))
                elif update and (
                    not current.is_active
                    or current.tenure_months != tenure
                    or current.plan_type != plan
                ):
                    planned_update.append(code)
                else:
                    unchanged.append(code)

        self._report(planned_create, planned_update, unchanged, commit, update)

        if not commit:
            if planned_create or planned_update:
                self.stdout.write(
                    self.style.WARNING("\nDry run. Re-run with --commit to write these.")
                )
            return

        created, updated = self._write(planned_create, planned_update, PlanTemplate)
        self.stdout.write(
            self.style.SUCCESS(f"\nCreated {created} template(s), updated {updated}.")
        )
        self.stdout.write(
            "Deposit percent left empty on rent/lease, so the price-banded deposit still applies."
        )

    @transaction.atomic
    def _write(self, planned_create, planned_update, PlanTemplate) -> tuple[int, int]:
        created = 0
        for code, plan, tenure in planned_create:
            template = PlanTemplate(
                template_code=code,
                name=f"{PLAN_LABELS.get(plan, plan)} — {tenure} months",
                description=(
                    f"{PLAN_LABELS.get(plan, plan)} tenure option shown on the public "
                    "catalogue. Customers may also enter their own tenure."
                ),
                plan_type=plan,
                tenure_months=tenure,
                # Left empty on purpose: rent/lease deposits follow the price
                # bands, and PlanTemplate.clean() forbids a deposit on EMI.
                default_security_deposit_percent=None,
                is_active=True,
            )
            template.save()
            created += 1

        updated = 0
        for code in planned_update:
            plan, tenure = code.rsplit("-", 1)
            PlanTemplate.objects.filter(template_code=code).update(
                is_active=True, plan_type=plan, tenure_months=int(tenure)
            )
            updated += 1

        return created, updated

    def _report(self, planned_create, planned_update, unchanged, commit, update):
        verb = "Creating" if commit else "Would create"
        self.stdout.write(self.style.MIGRATE_HEADING(f"\n{verb} {len(planned_create)} template(s):"))
        for code, plan, tenure in planned_create:
            self.stdout.write(f"  {code}: {PLAN_LABELS.get(plan, plan)}, {tenure} months")

        if planned_update:
            self.stdout.write(
                self.style.MIGRATE_HEADING(f"\nWould update {len(planned_update)} existing:")
            )
            for code in planned_update:
                self.stdout.write(f"  {code}")

        if unchanged:
            hint = "" if update else " (pass --update to correct these)"
            self.stdout.write(f"\nAlready present, left alone: {len(unchanged)}{hint}")

        if any(code.startswith("EMI-") for code, _, _ in planned_create):
            self.stdout.write(
                self.style.WARNING(
                    "\nNote: EMI templates take priority over Lucky Plan batch durations. "
                    "Once these exist, creating batches will not change public EMI tenures."
                )
            )
