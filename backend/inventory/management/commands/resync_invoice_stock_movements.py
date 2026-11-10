from django.core.management.base import BaseCommand
from billing.models import BillingInvoice, BillingDocumentStatus
from inventory.services.stock_service import post_invoice_stock_movements


class Command(BaseCommand):
    help = "Resync stock ledger entries for posted billing invoices (e.g. bundled accessories / Commercial Plyboard)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--invoice-no",
            type=str,
            help="Invoice document number (e.g. INV/FY2026-27/00002)",
        )
        parser.add_argument(
            "--invoice-id",
            type=int,
            help="Invoice ID (primary key)",
        )
        parser.add_argument(
            "--all-posted",
            action="store_true",
            help="Resync all invoices in POSTED status.",
        )

    def handle(self, *args, **options):
        invoice_no = options.get("invoice_no")
        invoice_id = options.get("invoice_id")
        all_posted = options.get("all_posted")

        if not invoice_no and not invoice_id and not all_posted:
            self.stdout.write(self.style.ERROR("Please specify --invoice-no, --invoice-id, or --all-posted."))
            return

        queryset = BillingInvoice.objects.filter(
            status__in=[BillingDocumentStatus.POSTED, BillingDocumentStatus.APPROVED]
        ).order_by("id")
        if invoice_no:
            queryset = queryset.filter(document_no=invoice_no)
        elif invoice_id:
            queryset = queryset.filter(id=invoice_id)

        count = queryset.count()
        if count == 0:
            self.stdout.write(self.style.WARNING("No matching posted invoices found."))
            return

        self.stdout.write(f"Syncing stock movements for {count} invoice(s)...")
        total_created = 0
        total_existing = 0
        for inv in queryset:
            res = post_invoice_stock_movements(invoice=inv)
            created = res.get("created_count", 0)
            existing = res.get("existing_count", 0)
            total_created += created
            total_existing += existing
            self.stdout.write(
                f"  Invoice #{inv.id} ({inv.document_no}): "
                f"+{created} created, {existing} existing entries"
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Completed. Created {total_created} new stock ledger entry(ies), {total_existing} existing across {count} invoice(s)."
            )
        )
