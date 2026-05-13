from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounting.services.non_gst_document_service import build_non_gst_snapshot
from accounting.services.purchase_tax_service import build_purchase_tax_snapshot
from accounting.services.tax_profile_service import build_product_tax_snapshot, build_tax_profile_snapshot
from billing.models import BillingInvoice, BillingInvoiceLine, DirectSale, ReceiptDocument
from inventory.models import PurchaseBill
from subscriptions.models import RentLeaseBillingDemand, Subscription


class Command(BaseCommand):
    help = "Populate missing tax_profile_snapshot JSON fields as GST_UNREGISTERED without altering historical amounts."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Preview only; do not persist changes.")
        parser.add_argument("--confirm", action="store_true", help="Persist the backfill.")

    def handle(self, *args, **options):
        dry_run = bool(options.get("dry_run"))
        confirm = bool(options.get("confirm"))
        if dry_run and confirm:
            raise CommandError("Use only one of --dry-run or --confirm.")
        if not dry_run and not confirm:
            dry_run = True

        report = {
            "direct_sales": self._fill_direct_sales(dry_run=dry_run),
            "billing_invoices": self._fill_billing_invoices(dry_run=dry_run),
            "billing_invoice_lines": self._fill_billing_invoice_lines(dry_run=dry_run),
            "receipts": self._fill_receipts(dry_run=dry_run),
            "purchase_bills": self._fill_purchase_bills(dry_run=dry_run),
            "subscriptions": self._fill_subscriptions(dry_run=dry_run),
            "rent_lease_demands": self._fill_rent_lease_demands(dry_run=dry_run),
        }

        mode_label = "DRY-RUN" if dry_run else "CONFIRMED"
        self.stdout.write(self.style.SUCCESS(f"{mode_label} backfill summary:"))
        for key, value in report.items():
            self.stdout.write(f"- {key}: {value}")

    @transaction.atomic
    def _fill_direct_sales(self, *, dry_run: bool) -> int:
        count = 0
        for row in DirectSale.objects.filter(tax_profile_snapshot__isnull=True).iterator(chunk_size=200):
            row.tax_profile_snapshot = build_non_gst_snapshot(
                document_type="DIRECT_SALE",
                document_date=row.sale_date,
                party_type="CUSTOMER",
                party_id=row.customer_id,
            )
            count += 1
            if not dry_run:
                row.save(update_fields=["tax_profile_snapshot", "updated_at"])
        return count

    @transaction.atomic
    def _fill_billing_invoices(self, *, dry_run: bool) -> int:
        count = 0
        for row in BillingInvoice.objects.filter(tax_profile_snapshot__isnull=True).iterator(chunk_size=200):
            row.tax_profile_snapshot = build_non_gst_snapshot(
                document_type="COMMERCIAL_INVOICE",
                document_date=row.invoice_date,
                party_type="CUSTOMER",
                party_id=row.customer_id,
            )
            count += 1
            if not dry_run:
                row.save(update_fields=["tax_profile_snapshot", "updated_at"])
        return count

    @transaction.atomic
    def _fill_billing_invoice_lines(self, *, dry_run: bool) -> int:
        count = 0
        for row in BillingInvoiceLine.objects.filter(tax_profile_snapshot__isnull=True).iterator(chunk_size=400):
            row.tax_profile_snapshot = {
                "profile": build_tax_profile_snapshot(on_date=getattr(row.invoice, "invoice_date", None)),
                "product": build_product_tax_snapshot(product_id=row.product_id),
                "line_tax_total": "0.00",
            }
            count += 1
            if not dry_run:
                row.save(update_fields=["tax_profile_snapshot", "updated_at"])
        return count

    @transaction.atomic
    def _fill_receipts(self, *, dry_run: bool) -> int:
        count = 0
        for row in ReceiptDocument.objects.filter(tax_profile_snapshot__isnull=True).iterator(chunk_size=200):
            row.tax_profile_snapshot = build_non_gst_snapshot(
                document_type="NON_GST_RECEIPT",
                document_date=row.receipt_date,
                party_type="CUSTOMER",
                party_id=row.customer_id,
            )
            count += 1
            if not dry_run:
                row.save(update_fields=["tax_profile_snapshot", "updated_at"])
        return count

    @transaction.atomic
    def _fill_purchase_bills(self, *, dry_run: bool) -> int:
        count = 0
        for row in PurchaseBill.objects.filter(tax_profile_snapshot__isnull=True).iterator(chunk_size=200):
            row.tax_profile_snapshot = build_purchase_tax_snapshot(purchase_bill=row)
            count += 1
            if not dry_run:
                row.save(update_fields=["tax_profile_snapshot", "updated_at"])
        return count

    @transaction.atomic
    def _fill_subscriptions(self, *, dry_run: bool) -> int:
        count = 0
        for row in Subscription.objects.filter(tax_profile_snapshot__isnull=True).iterator(chunk_size=200):
            row.tax_profile_snapshot = build_non_gst_snapshot(
                document_type="CONTRACT",
                document_date=row.start_date,
                party_type="CUSTOMER",
                party_id=row.customer_id,
                product_id=row.product_id,
            )
            count += 1
            if not dry_run:
                row.save(update_fields=["tax_profile_snapshot"])
        return count

    @transaction.atomic
    def _fill_rent_lease_demands(self, *, dry_run: bool) -> int:
        count = 0
        for row in RentLeaseBillingDemand.objects.filter(tax_profile_snapshot__isnull=True).iterator(chunk_size=200):
            row.tax_profile_snapshot = build_non_gst_snapshot(
                document_type="RENT_LEASE_RECEIPT",
                document_date=row.due_date,
                party_type="CUSTOMER",
                party_id=row.subscription.customer_id if row.subscription_id else None,
                product_id=row.subscription.product_id if row.subscription_id else None,
            )
            count += 1
            if not dry_run:
                row.save(update_fields=["tax_profile_snapshot", "updated_at"])
        return count
