"""
Reconcile missing ServiceDesk delivery cases (and re-run purchase-need sync) for direct sales.

Default is dry-run (no writes). Use --apply to persist.

Examples:
    python manage.py reconcile_direct_sale_operations
    python manage.py reconcile_direct_sale_operations --apply --sale-id 42
    python manage.py reconcile_direct_sale_operations --apply --username admin
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from billing.models import DirectSale, DirectSaleStatus
from billing.services import billing_service as billing_service_module
from billing.services.direct_sale_delivery_bridge_service import (
    get_direct_sale_delivery_case,
    sync_direct_sale_delivery_case,
)
from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit


class Command(BaseCommand):
    help = "Dry-run by default: fix missing DIRECT_SALE_DELIVERY cases; optionally re-sync purchase needs."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            default=False,
            help="Persist fixes (default: dry-run only).",
        )
        parser.add_argument("--sale-id", type=int, default=None, help="Limit to a single DirectSale primary key.")
        parser.add_argument(
            "--username",
            default=None,
            help="Audit actor username for applied changes (defaults to first active superuser).",
        )

    def handle(self, *args, **options):
        apply_changes: bool = options["apply"]
        sale_id = options["sale_id"]
        username = options["username"]

        User = get_user_model()
        actor = None
        if username:
            actor = User.objects.filter(username=username).first()
            if actor is None:
                self.stderr.write(self.style.ERROR(f"No user found with username={username!r}."))
                return
        else:
            actor = User.objects.filter(is_superuser=True, is_active=True).order_by("id").first()

        if apply_changes and actor is None:
            self.stderr.write(self.style.ERROR("--apply requires a valid actor; pass --username or create a superuser."))
            return

        qs = DirectSale.objects.all().order_by("id")
        if sale_id is not None:
            qs = qs.filter(pk=sale_id)

        delivery_gaps = 0

        for sale in qs.iterator():
            if sale.status == DirectSaleStatus.CANCELLED:
                continue

            if sale.delivery_required and get_direct_sale_delivery_case(sale=sale) is None:
                self.stdout.write(
                    f"  [delivery] DirectSale #{sale.pk} ({sale.sale_no}) missing DIRECT_SALE_DELIVERY case."
                )
                delivery_gaps += 1
                if apply_changes:
                    with transaction.atomic():
                        sync_direct_sale_delivery_case(sale=sale, actor=actor)
                        log_audit(
                            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
                            instance=sale,
                            performed_by=actor,
                            metadata={
                                "event": "RECONCILE_DIRECT_SALE_DELIVERY_CASE",
                                "direct_sale_id": sale.id,
                                "sale_no": sale.sale_no,
                                "command": "reconcile_direct_sale_operations",
                            },
                        )

            if apply_changes:
                line_payloads = billing_service_module._serialize_direct_sale_line_payloads(
                    [
                        {
                            "product": line.product,
                            "inventory_item": line.inventory_item,
                            "description": line.description,
                            "quantity": line.quantity,
                            "unit_price": line.unit_price,
                            "discount_amount": line.discount_amount,
                            "taxable_value": line.taxable_value,
                            "gst_rate": line.gst_rate,
                            "cgst_amount": line.cgst_amount,
                            "sgst_amount": line.sgst_amount,
                            "igst_amount": line.igst_amount,
                            "line_total": line.line_total,
                            "hsn_sac_code": line.hsn_sac_code,
                            "create_purchase_requirement": False,
                            "requirement_quantity": None,
                            "requirement_note": "",
                        }
                        for line in sale.lines.select_related("product", "inventory_item").all()
                    ]
                )
                if line_payloads:
                    with transaction.atomic():
                        billing_service_module._sync_direct_sale_purchase_needs(
                            sale=sale,
                            line_payloads=line_payloads,
                            actor=actor,
                        )

        if not apply_changes:
            self.stdout.write(
                self.style.WARNING(
                    f"DRY RUN — direct-sale delivery case gaps: {delivery_gaps}. "
                    "Use --apply to create missing cases and re-run purchase-need sync."
                )
            )
            return

        self.stdout.write(
            self.style.SUCCESS(
                f"Applied with actor={getattr(actor, 'username', None)} "
                f"(delivery gaps addressed: {delivery_gaps}; purchase-need sync executed per sale)."
            )
        )
