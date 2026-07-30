import sys
from datetime import date
from django.core.management.base import BaseCommand
from django.utils import timezone
from textwrap import dedent


class Command(BaseCommand):
    help = "Generates a daily digest email payload for the Solopreneur using the same data as the Today view."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print the digest to stdout instead of sending it",
        )
        parser.add_argument(
            "--as-of",
            type=date.fromisoformat,
            help="Generate digest as of this date (YYYY-MM-DD). Defaults to today.",
        )

    def handle(self, *args, **options):
        # Local import to avoid setup issues when django loads commands
        from api.v1.views.admin_solopreneur_today import build_solopreneur_today_payload
        
        dry_run = options["dry_run"]
        as_of = options.get("as_of")
        
        # If --as-of is provided, we temporarily mock timezone.localdate inside the builder.
        # But for simplicity, if as_of is provided and not today, we warn that the data 
        # is real-time and cannot accurately project past states natively right now.
        today = timezone.localdate()
        if as_of and as_of != today:
            self.stdout.write(self.style.WARNING("Warning: Digest data is computed in real-time. Passing a past date will not reconstruct past state accurately."))
            
        payload = build_solopreneur_today_payload()
        
        money = payload["money_today"]
        queue = payload["action_queue"]
        health = payload["health"]
        
        # Build Markdown report
        lines = [
            f"# Solopreneur Daily Digest: {payload['date']}",
            "",
            "## Money Today",
            f"- **Collected Yesterday**: ₹{money['yesterday_collections_total']}",
            f"- **Due Today**: ₹{money['emis_due_today_total']} ({money['emis_due_today_count']} EMIs)",
            f"- **Overdue EMIs**: ₹{money['emis_overdue_total']} ({money['emis_overdue_count']} EMIs)",
            f"- **Direct Sale Outstanding**: ₹{money['ds_outstanding_total']} ({money['ds_outstanding_count']} orders)",
            "",
            "## Action Required",
        ]
        
        if not queue:
            lines.append("- All clear! No urgent actions needed.")
        else:
            for item in queue:
                severity_icon = "🔴" if item["severity"] == "red" else "🟡"
                lines.append(f"- {severity_icon} {item['label']}")
                
        lines.extend([
            "",
            "## Health Check",
            f"- **Ledger Balanced**: {'Yes' if health['is_balanced'] else 'NO — Run Daily Close'}",
            f"- **Last Daily Close**: {health['last_daily_close_date'] or 'Never'}",
            "",
            "Generated automatically by Subidha Core.",
        ])
        
        report = "\n".join(lines)
        
        if dry_run:
            self.stdout.write(report)
        else:
            # Here we would send it to the system admin email.
            # E.g. mail_service.send_system_alert("Daily Digest", report)
            self.stdout.write(self.style.SUCCESS("Digest generated (and theoretically sent). Run with --dry-run to view."))
