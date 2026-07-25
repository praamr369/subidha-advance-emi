"""Sweep and reconcile leads whose pipeline stage drifted from customer truth.

Intended to run on a schedule (cron / task runner) so lead → customer state
stays consistent automatically. Also runnable ad hoc:

    python manage.py reconcile_lead_conversions            # apply
    python manage.py reconcile_lead_conversions --dry-run  # report only
"""

from __future__ import annotations

from django.core.management.base import BaseCommand

from crm.services.lead_reconcile_service import find_reconcilable_leads, reconcile_all_leads


class Command(BaseCommand):
    help = "Reconcile CRM leads whose stage/customer link drifted (auto-convert consistency)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report which leads would be reconciled without changing anything.",
        )

    def handle(self, *args, **options):
        if options["dry_run"]:
            leads = find_reconcilable_leads()
            self.stdout.write(f"[dry-run] {len(leads)} lead(s) would be reconciled:")
            for lead in leads:
                link = lead.converted_customer_id or "phone-match"
                self.stdout.write(f"  lead #{lead.id} {lead.name} (stage={lead.stage}, customer={link})")
            return

        summary = reconcile_all_leads(performed_by=None)
        self.stdout.write(
            self.style.SUCCESS(
                f"Reconciled {summary['reconciled']} of {summary['scanned']} scanned lead(s)."
            )
        )
        for r in summary["results"]:
            if r.get("changed"):
                self.stdout.write(f"  lead #{r['lead_id']}: {r['action']} -> customer #{r.get('customer_id')}")
