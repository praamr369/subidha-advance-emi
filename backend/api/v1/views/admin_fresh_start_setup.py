from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.db import transaction
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.models import FinanceAccount, FinanceAccountKind
from accounting.services.setup_defaults_service import apply_accounting_setup_defaults, preview_accounting_setup_defaults
from api.v1.permissions import IsAdmin
from branch_control.models import Branch, BranchStatus, CashCounter
from inventory.models import StockLocation, StockLocationType
from subscriptions.models import Batch, BatchStatus, LuckyId, LuckyIdStatus, Product
from subscriptions.models_business_setup import BusinessProfile
from subscriptions.services.business_compliance_governance_service import seed_business_compliance_rows
from subscriptions.services.document_numbering_service import get_document_numbering_state, seed_default_document_numbering
from subscriptions.services.document_print_settings_service import get_or_create_document_print_settings
from subscriptions.services.policy_coverage_catalog import INTERNAL, PUBLIC, get_policy_coverage_specs
from subscriptions.services.policy_governance_service import (
    accept_internal_policy,
    hydrate_policy_governance_metadata,
    publish_policy_page,
    seed_default_policy_pages,
)
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
                    "active Subidha business profile when missing",
                    "starter active product, Lucky Plan batch, and available Lucky IDs when missing",
                    "seeded empty compliance document rows (no files, PRIVATE/PENDING)",
                    "seeded draft policy page templates and auto-published public policies",
                    "minimal print branding settings object",
                    "default document numbering setup profiles",
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
                    "Customer",
                    "CRM Party",
                ],
                "accounting_defaults_preview": preview_accounting_setup_defaults(),
                "document_numbering_preview": self._safe_get_numbering_state(),
                "readiness": get_setup_readiness(),
                "safety_contract": "Preview is read-only. It does not post, reconcile, invoice, receipt, pay, allocate stock, or create contracts.",
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        confirm = bool((request.data or {}).get("confirm"))
        dry_run = bool((request.data or {}).get("dry_run", False))
        if not confirm and not dry_run:
            return Response({"detail": "confirm=true is required unless dry_run=true."}, status=status.HTTP_400_BAD_REQUEST)

        before = get_setup_readiness()
        # Core setup runs in a single atomic block (COA, finance accounts, branch, catalog).
        with transaction.atomic():
            business_profile_payload = self._ensure_business_profile(request.user, dry_run=dry_run)
            accounting_result = apply_accounting_setup_defaults(performed_by=request.user) if not dry_run else preview_accounting_setup_defaults()
            try:
                numbering_result = get_document_numbering_state() if dry_run else seed_default_document_numbering(performed_by=request.user)
            except Exception as exc:
                numbering_result = {"skipped": True, "reason": str(exc), "note": "Configure a financial year before document numbering can be seeded."}
            print_settings = None if dry_run else get_or_create_document_print_settings()
            branch_payload = self._ensure_default_branch(dry_run=dry_run)
            counter_payload = self._ensure_default_cash_counter(dry_run=dry_run)
            starter_catalog_payload = self._ensure_starter_catalog(dry_run=dry_run)
        # Compliance rows and policy governance run in separate transactions so that nested
        # @transaction.atomic calls inside policy_governance_service don't conflict with the
        # main setup block above.
        compliance_payload = self._ensure_compliance_rows(request.user, dry_run=dry_run)
        policy_payload = self._ensure_policy_governance(request.user, dry_run=dry_run)
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
                "document_numbering": numbering_result,
                "print_branding_settings_id": getattr(print_settings, "id", None),
                "business_profile": business_profile_payload,
                "branch": branch_payload,
                "cash_counter": counter_payload,
                "starter_catalog": starter_catalog_payload,
                "compliance_rows": compliance_payload,
                "policy_governance": policy_payload,
                "before": before,
                "after": after,
                "safety_contract": "Fresh-start setup creates setup master data only. It does not post, reconcile, invoice, receipt, pay, allocate stock, or create contracts.",
            },
            status=status.HTTP_200_OK,
        )

    def _safe_get_numbering_state(self) -> dict:
        try:
            return get_document_numbering_state()
        except Exception as exc:
            return {"skipped": True, "reason": str(exc), "note": "Configure a financial year to enable document numbering."}

    def _ensure_business_profile(self, user, *, dry_run: bool) -> dict:
        existing = BusinessProfile.objects.filter(is_active=True).order_by("id").first()
        if existing:
            return {"status": "EXISTS", "id": existing.id, "legal_name": existing.legal_name, "trade_name": existing.trade_name}
        payload = {
            "legal_name": "Subidha Furniture",
            "trade_name": "Subidha Furniture",
            "business_code": "SUBIDHA",
            "primary_phone": (getattr(user, "phone", "") or "").strip(),
            "primary_email": (getattr(user, "email", "") or "").strip(),
            "country": "India",
            "default_currency_code": "INR",
            "timezone_name": "Asia/Kolkata",
            "receipt_prefix": "RCPT",
            "invoice_prefix": "INV",
            "is_active": True,
        }
        if dry_run:
            return {"status": "WOULD_CREATE", **payload}
        profile = BusinessProfile.objects.create(**payload)
        return {"status": "CREATED", "id": profile.id, "legal_name": profile.legal_name, "trade_name": profile.trade_name}

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

    def _ensure_starter_catalog(self, *, dry_run: bool) -> dict:
        product = Product.objects.filter(is_active=True).order_by("id").first()
        batch = Batch.objects.order_by("id").first()
        lucky_id_count = LuckyId.objects.count()
        location = StockLocation.objects.filter(is_active=True, location_type__in=[StockLocationType.STORE, StockLocationType.WAREHOUSE, StockLocationType.SHOWROOM]).order_by("id").first()
        if product and batch and lucky_id_count and location:
            return {
                "status": "EXISTS",
                "product_id": product.id,
                "batch_id": batch.id,
                "lucky_id_count": lucky_id_count,
                "stock_location_id": location.id,
            }
        result = {
            "status": "WOULD_CREATE" if dry_run else "CREATED",
            "product": "starter active furniture product" if not product else "EXISTS",
            "batch": "starter open Lucky Plan batch" if not batch else "EXISTS",
            "lucky_ids": 100 if not lucky_id_count else lucky_id_count,
            "stock_location": "starter showroom location" if not location else "EXISTS",
        }
        if dry_run:
            return result

        if location is None:
            location = StockLocation.objects.get_or_create(
                code="SUBIDHA-MAIN-SHOWROOM",
                defaults={
                    "name": "Subidha Main Showroom",
                    "location_type": StockLocationType.SHOWROOM,
                    "is_active": True,
                    "notes": "Default showroom location created by Fresh Start Setup.",
                },
            )[0]
        result["stock_location_id"] = location.id

        if product is None:
            product = Product.objects.create(
                product_code="SUBIDHA-STARTER-FURNITURE",
                name="Subidha Starter Furniture",
                base_price=Decimal("15000.00"),
                category="Furniture",
                subcategory="Starter",
                description="Starter catalog item created by Fresh Start Setup. Review and replace with the real live product catalog before public sale.",
                is_active=True,
                is_emi_enabled=True,
                is_rent_enabled=True,
                is_lease_enabled=True,
                is_rent_ready=True,
                is_lease_ready=True,
                is_direct_sale_enabled=True,
            )
        if batch is None:
            batch = Batch.objects.create(
                batch_code="SUBIDHA-STARTER-2026",
                total_slots=100,
                duration_months=15,
                draw_day=5,
                start_date=date(2026, 7, 1),
                status=BatchStatus.OPEN,
            )
        existing_numbers = set(LuckyId.objects.filter(batch=batch).values_list("lucky_number", flat=True))
        created_lucky_ids = 0
        for lucky_number in range(100):
            if lucky_number in existing_numbers:
                continue
            LuckyId.objects.create(batch=batch, lucky_number=lucky_number, status=LuckyIdStatus.AVAILABLE)
            created_lucky_ids += 1
        result.update(
            {
                "product_id": product.id,
                "batch_id": batch.id,
                "created_lucky_ids": created_lucky_ids,
                "lucky_id_count": LuckyId.objects.filter(batch=batch).count(),
            }
        )
        return result

    def _ensure_compliance_rows(self, user, *, dry_run: bool) -> dict:
        from subscriptions.models_business_setup import BusinessComplianceDocument
        existing_count = BusinessComplianceDocument.objects.filter(is_active=True).count()
        if dry_run:
            return {"status": "WOULD_SEED" if not existing_count else "EXISTS", "existing_count": existing_count}
        result = seed_business_compliance_rows(performed_by=user)
        return {"status": "SEEDED" if result["created_count"] else "EXISTS", **result}

    def _ensure_policy_governance(self, user, *, dry_run: bool) -> dict:
        from subscriptions.models_business_setup import PolicyPage, PolicyStatus

        specs = get_policy_coverage_specs()
        if dry_run:
            public_count = sum(1 for s in specs if s.visibility == PUBLIC)
            internal_count = sum(1 for s in specs if s.visibility == INTERNAL)
            return {"status": "WOULD_SEED_AND_PUBLISH", "public_policies": public_count, "internal_policies": internal_count}

        seed_result = seed_default_policy_pages(performed_by=user)
        published = 0
        accepted = 0
        skipped = 0
        for spec in specs:
            policy = PolicyPage.objects.filter(slug=spec.slug).order_by("-version", "-id").first()
            if policy is None:
                skipped += 1
                continue
            if spec.visibility == PUBLIC:
                if policy.status != "PUBLISHED":
                    try:
                        publish_policy_page(policy=policy, performed_by=user, review_now=True)
                        published += 1
                    except Exception:
                        skipped += 1
                else:
                    skipped += 1
            elif spec.visibility == INTERNAL:
                meta = hydrate_policy_governance_metadata(policy)
                already_accepted = bool(meta.internal_acceptance_at)
                if not already_accepted and policy.status not in {"APPROVED", "PUBLISHED"}:
                    try:
                        accept_internal_policy(policy, performed_by=user)
                        accepted += 1
                    except Exception:
                        skipped += 1
                else:
                    skipped += 1
        return {"status": "DONE", "seed_result": seed_result, "public_published": published, "internal_accepted": accepted, "skipped": skipped}
