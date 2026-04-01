from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from subscriptions.models import (
    AuditLog,
    Commission,
    Emi,
    EmiStatus,
    FinancialLedger,
    LedgerEntryType,
    LedgerDirection,
    MONEY_ZERO,
    PartnerCollectionRequest,
    PartnerCollectionRequestStatus,
)
from subscriptions.services.payment_service import (
    _get_emi_net_paid,
    _refresh_emi_status,
    _refresh_subscription_status,
)
from subscriptions.services.commission_service import create_commission_for_payment


class Command(BaseCommand):
    help = (
        "Repair approved partner collection requests where payment rows exist "
        "but EMI / ledger / subscription state is not aligned."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--request-id",
            type=int,
            dest="request_id",
            help="Repair only one PartnerCollectionRequest by id.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            dest="dry_run",
            help="Inspect and print what would change without saving.",
        )

    def handle(self, *args, **options):
        request_id = options.get("request_id")
        dry_run = options.get("dry_run", False)

        queryset = (
            PartnerCollectionRequest.objects.select_related(
                "partner",
                "subscription",
                "customer",
                "approved_payment",
                "approved_emi",
            )
            .filter(status=PartnerCollectionRequestStatus.APPROVED)
            .order_by("id")
        )

        if request_id:
            queryset = queryset.filter(id=request_id)

        total_checked = 0
        total_repaired = 0
        total_skipped = 0
        total_failed = 0

        for collection_request in queryset:
            total_checked += 1

            try:
                repaired = self._repair_one(collection_request, dry_run=dry_run)
                if repaired:
                    total_repaired += 1
                else:
                    total_skipped += 1
            except Exception as exc:
                total_failed += 1
                self.stdout.write(
                    self.style.ERROR(
                        f"[FAILED] request #{collection_request.id}: {exc}"
                    )
                )

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Repair summary"))
        self.stdout.write(f"Checked : {total_checked}")
        self.stdout.write(f"Repaired: {total_repaired}")
        self.stdout.write(f"Skipped : {total_skipped}")
        self.stdout.write(f"Failed  : {total_failed}")

    @transaction.atomic
    def _repair_one(self, collection_request, dry_run=False):
        payment = collection_request.approved_payment
        subscription = collection_request.subscription
        approved_emi = collection_request.approved_emi

        if payment is None:
            self.stdout.write(
                self.style.WARNING(
                    f"[SKIP] request #{collection_request.id}: no approved_payment linked."
                )
            )
            return False

        if payment.subscription_id != subscription.id:
            raise ValueError(
                "Approved payment subscription does not match collection request subscription."
            )

        target_emi = approved_emi or payment.emi

        if target_emi is None:
            target_emi = (
                Emi.objects.select_for_update()
                .filter(subscription=subscription, month_no=1)
                .order_by("month_no", "id")
                .first()
            )

        if target_emi is None:
            raise ValueError("No EMI found to repair against this payment.")

        changes = []

        if payment.emi_id != target_emi.id:
            changes.append(
                f"link payment.emi {payment.emi_id} -> {target_emi.id}"
            )

        ledger_exists = FinancialLedger.objects.filter(
            payment=payment,
            emi=target_emi,
            entry_type=LedgerEntryType.EMI_PAYMENT,
        ).exists()

        if not ledger_exists:
            changes.append("create missing EMI_PAYMENT ledger entry")

        expected_collected_by_id = collection_request.partner_id
        if payment.collected_by_id != expected_collected_by_id:
            changes.append(
                f"payment.collected_by {payment.collected_by_id} -> {expected_collected_by_id}"
            )

        if payment.verified_by_id is None:
            changes.append("set payment.verified_by from request.reviewed_by")

        if collection_request.approved_emi_id != target_emi.id:
            changes.append(
                f"link collection_request.approved_emi {collection_request.approved_emi_id} -> {target_emi.id}"
            )

        commission_exists = Commission.objects.filter(payment=payment).exists()
        if not commission_exists:
            changes.append("create missing commission")

        payment_metadata = dict(payment.allocation_metadata or {})
        if "partner_collection_request" not in payment_metadata:
            changes.append("attach partner_collection_request metadata")

        if not changes:
            self.stdout.write(
                self.style.NOTICE(
                    f"[OK] request #{collection_request.id}: already aligned."
                )
            )

            if not dry_run:
                _refresh_emi_status(target_emi)
                _refresh_subscription_status(subscription)

            return False

        self.stdout.write(
            self.style.WARNING(
                f"[REPAIR] request #{collection_request.id}: " + "; ".join(changes)
            )
        )

        if dry_run:
            return True

        if payment.emi_id != target_emi.id:
            payment.emi = target_emi

        if payment.collected_by_id != expected_collected_by_id:
            payment.collected_by = collection_request.partner

        if payment.verified_by_id is None and collection_request.reviewed_by_id:
            payment.verified_by = collection_request.reviewed_by

        payment_metadata = dict(payment.allocation_metadata or {})
        payment_metadata["partner_collection_request"] = {
            "request_id": collection_request.id,
            "partner_id": collection_request.partner_id,
            "approved_by_id": collection_request.reviewed_by_id,
            "approved_at": (
                collection_request.reviewed_at.isoformat()
                if collection_request.reviewed_at
                else timezone.now().isoformat()
            ),
            "repair_backfilled": True,
        }
        payment.allocation_metadata = payment_metadata
        payment.save(
            update_fields=[
                "emi",
                "collected_by",
                "verified_by",
                "allocation_metadata",
            ]
        )

        if not ledger_exists:
            FinancialLedger.objects.create(
                emi=target_emi,
                payment=payment,
                entry_type=LedgerEntryType.EMI_PAYMENT,
                entry_direction=LedgerDirection.CREDIT,
                amount=payment.amount,
                allocation_context={
                    "source": "REPAIR_PARTNER_APPROVED_PAYMENT",
                    "partner_collection_request_id": collection_request.id,
                    "payment_id": payment.id,
                    "subscription_id": subscription.id,
                    "emi_id": target_emi.id,
                },
            )

        if collection_request.approved_emi_id != target_emi.id:
            collection_request.approved_emi = target_emi
            collection_request.save(update_fields=["approved_emi", "updated_at"])

        if not commission_exists:
            create_commission_for_payment(
                payment=payment,
                actor=collection_request.reviewed_by or collection_request.partner,
            )

        _refresh_emi_status(target_emi)
        _refresh_subscription_status(subscription)

        AuditLog.objects.create(
            action_type=AuditLog.ActionType.PAYMENT_RECONCILED,
            performed_by=collection_request.reviewed_by,
            model_name="partner_collection_request",
            object_id=collection_request.id,
            metadata={
                "repair_command": "repair_partner_approved_payments",
                "request_id": collection_request.id,
                "payment_id": payment.id,
                "subscription_id": subscription.id,
                "emi_id": target_emi.id,
                "payment_amount": str(payment.amount),
                "emi_net_paid_after_repair": str(_get_emi_net_paid(target_emi)),
            },
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"[DONE] request #{collection_request.id}: payment #{payment.id}, emi #{target_emi.id}"
            )
        )
        return True
