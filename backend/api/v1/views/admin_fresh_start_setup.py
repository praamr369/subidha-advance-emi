from __future__ import annotations

from django.db import transaction
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.models import FinanceAccount, FinanceAccountKind
from accounting.services.setup_defaults_service import apply_accounting_setup_defaults, preview_accounting_setup_defaults
from api.v1.permissions import IsAdmin
from branch_control.models import Branch, BranchStatus, CashCounter
from subscriptions.services.document_print_settings_service import get_or_create_document_print_settings
from subscriptions.services.setup_readiness_service import get_setup_readiness


class AdminFreshStartSetupView(APIView):
    """Safe day-zero setup action.

    This endpoint may create/repair setup master data only. It must not create financial
    source records, journals, receipts, payments, reconciliation rows, stock ledger rows,
    subscriptions, direct-sale invoices, commissions, payout batches, salary payments, or
    opening stock records.
    """

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        return Response(
            {
                "mode": "read_only_preview",
                "allowed_creations": [
                    "default COA",
                    "default FinanceAccounts",
                    "FinanceAccountCoaMappings",
                    "default active branch when missing",
                    "default cash counter when a collection-ready cash FinanceAccount exists",
                    "minimal print branding settings object",
                    "accounting setup metadata only",
                ],
                "forbidden_creations": [
                    "Payment",
                    "ReceiptDocument",
                    "JournalEntry",
                    "MoneyMovement",
                    "SettlementAllocation",
                    "ReconciliationItem",
                    "StockLedger",
                    "OpeningStock",
                    "SalaryPayment",
                    "Commission",
                    "PayoutBatch",
                    "Subscription",
                    "DirectSale invoice",
                ],
                "accounting_defaults_preview": preview_accounting_setup_defaults(),
                "readiness": get_setup_readiness(),
            },
            status=status.HTTP_200_OK,
        )

    @transaction.atomic
    def post(self, request):
        confirm = bool((request.data or {}).get("confirm"))
        dry_run = bool((request.data or {}).get("dry_run", False))
        if not confirm and not dry_run:
            return Response({"detail": "confirm=true is required unless dry_run=true."}, status=status.HTTP_400_BAD_REQUEST)

        before = get_setup_readiness()
        accounting_result = apply_accounting_setup_defaults(performed_by=request.user) if not dry_run else preview_accounting_setup_defaults()
        print_settings = None if dry_run else get_or_create_document_print_settings()
        branch_payload = self._ensure_default_branch(dry_run=dry_run)
        counter_payload = self._ensure_default_cash_counter(dry_run=dry_run)
        after = get_setup_readiness() if not dry_run else before
        return Response(
            {
                "mode": "dry_run" if dry_run else "executed",
                "created_financial_records": 0,
                "journal_entries_created": 0,
                "document_numbers_allocated": 0,
                "stock_ledger_created": 0,
                "reconciliation_items_created": 0,
                "accounting_defaults": accounting_result,
                "print_branding_settings_id": getattr(print_settings, "id", None),
                "branch": branch_payload,
                "cash_counter": counter_payload,
                "before": before,
                "after": after,
                "safety_contract": "Fresh-start setup creates setup master data only. It does not post, reconcile, invoice, receipt, pay, allocate stock, or create contracts.",
            },
            status=status.HTTP_200_OK,
        )

    def _ensure_default_branch(self, *, dry_run: bool) -> dict:
        existing = Branch.objects.filter(status=BranchStatus.ACTIVE, is_primary=True).order_by("id").first()
        if existing:
            return {"status": "EXISTS", "id": existing.id, "code": existing.code, "name": existing.name}
        if dry_run:
            return {"status": "WOULD_CREATE", "code": "MAIN", "name": "Main Branch"}
        branch = Branch.objects.create(code="MAIN", name="Main Branch", status=BranchStatus.ACTIVE, is_primary=True, notes="Created by Fresh Start Setup.")
        return {"status": "CREATED", "id": branch.id, "code": branch.code, "name": branch.name}

    def _ensure_default_cash_counter(self, *, dry_run: bool) -> dict:
        existing = CashCounter.objects.filter(is_active=True).select_related("branch", "finance_account").order_by("id").first()
        if existing:
            return {"status": "EXISTS", "id": existing.id, "code": existing.code, "name": existing.name}
        branch = Branch.objects.filter(status=BranchStatus.ACTIVE, is_primary=True).order_by("id").first()
        cash_account = FinanceAccount.objects.filter(kind=FinanceAccountKind.CASH, is_active=True, is_real_settlement_account=True).select_related("chart_account").order_by("id").first()
        if branch is None or cash_account is None:
            return {"status": "SKIPPED", "reason": "Active primary branch or active cash FinanceAccount is missing."}
        if dry_run:
            return {"status": "WOULD_CREATE", "code": "MAIN-CASH", "name": "Main Cash Counter", "branch_id": branch.id, "finance_account_id": cash_account.id}
        if cash_account.branch_id and cash_account.branch_id != branch.id:
            return {"status": "SKIPPED", "reason": "Cash FinanceAccount belongs to a different branch; create counter manually."}
        counter = CashCounter.objects.create(code="MAIN-CASH", name="Main Cash Counter", branch=branch, finance_account=cash_account, is_active=True, notes="Created by Fresh Start Setup.")
        return {"status": "CREATED", "id": counter.id, "code": counter.code, "name": counter.name}
