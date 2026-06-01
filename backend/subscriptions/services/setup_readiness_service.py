from __future__ import annotations

from typing import Any

from django.contrib.auth import get_user_model

from accounting.models import (
    AccountingPostingProfile,
    BusinessTaxProfile,
    ChartOfAccount,
    FinanceAccount,
    FinanceAccountCoaMapping,
    FinanceAccountMappingPurpose,
)
from accounting.services.accounting_setup_service import AccountingSetupService
from accounting.services.finance_account_readiness import finance_account_readiness
from accounts.models import UserRole
from branch_control.models import Branch, BranchStatus, CashCounter
from subscriptions.models import Batch, ContractAmendment, ContractRecontractEvent, LuckyId, Product
from subscriptions.models_business_setup import BusinessProfile
from subscriptions.models_document_print_settings import DocumentPrintSettings
from subscriptions.services.business_compliance_governance_service import build_business_compliance_readiness
from subscriptions.services.document_numbering_service import get_document_numbering_state, required_numbering_keys_for_checklist
from subscriptions.services.policy_governance_service import build_policy_coverage_matrix

ReadinessStatus = str


def _section(
    *,
    key: str,
    title: str,
    status: ReadinessStatus,
    blockers: list[str] | None = None,
    warnings: list[str] | None = None,
    recommended_action: str,
    target_route: str,
    why_this_matters: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "key": key,
        "title": title,
        "status": status,
        "blockers": blockers or [],
        "warnings": warnings or [],
        "recommended_action": recommended_action,
        "target_route": target_route,
        "why_this_matters": why_this_matters,
        "metadata": metadata or {},
    }


def _status_from(blockers: list[str], warnings: list[str]) -> ReadinessStatus:
    if blockers:
        return "BLOCKED"
    if warnings:
        return "NEEDS_SETUP"
    return "READY"


def _document_numbering_ready() -> tuple[bool, dict[str, Any]]:
    numbering_state = get_document_numbering_state()
    required_keys = set(required_numbering_keys_for_checklist())
    rows = [row for row in numbering_state["sequences"] if row["key"] in required_keys]
    configured = all(row["configured"] for row in rows)
    preview_ready = all((row.get("next_number_preview") or "").strip() for row in rows if row["configured"])
    no_duplicates = bool(numbering_state["checks"].get("no_duplicate_issued_numbers"))
    return configured and preview_ready and no_duplicates, {
        "financial_year": numbering_state.get("financial_year"),
        "required_keys": sorted(required_keys),
        "configured_count": sum(1 for row in rows if row.get("configured")),
        "required_count": len(rows),
        "no_duplicate_issued_numbers": no_duplicates,
        "next_number_preview_available": bool(numbering_state["checks"].get("next_number_preview_available")),
    }


def _finance_account_rows() -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Return finance account readiness without treating archived accounts as live blockers."""
    rows: list[dict[str, Any]] = []
    counts = {
        "total": 0,
        "active": 0,
        "inactive": 0,
        "ready": 0,
        "active_blocked": 0,
        "blocked": 0,
        "inactive_not_ready": 0,
        "cash_ready": 0,
        "bank_ready": 0,
        "upi_ready": 0,
    }
    accounts = FinanceAccount.objects.select_related("chart_account", "branch").order_by("kind", "name", "id")
    for account in accounts:
        counts["total"] += 1
        if account.is_active:
            counts["active"] += 1
        else:
            counts["inactive"] += 1
        readiness = finance_account_readiness(account)
        if readiness.collection_ready:
            counts["ready"] += 1
            if account.kind == "CASH":
                counts["cash_ready"] += 1
            if account.kind == "BANK":
                counts["bank_ready"] += 1
            if account.kind == "UPI":
                counts["upi_ready"] += 1
        elif account.is_active and not readiness.diagnostic_only:
            counts["active_blocked"] += 1
            counts["blocked"] += 1
        elif not account.is_active and not readiness.diagnostic_only:
            counts["inactive_not_ready"] += 1
        chart = getattr(account, "chart_account", None)
        rows.append(
            {
                "id": account.id,
                "name": account.name,
                "kind": account.kind,
                "is_active": account.is_active,
                "diagnostic_only": readiness.diagnostic_only,
                "branch": getattr(account.branch, "name", None) if account.branch_id else None,
                "mapped_chart_account": (
                    {
                        "id": chart.id,
                        "code": chart.code,
                        "name": chart.name,
                        "account_type": chart.account_type,
                        "allow_manual_posting": chart.allow_manual_posting,
                        "is_active": chart.is_active,
                    }
                    if chart
                    else None
                ),
                "posting_ready": readiness.collection_ready,
                "collection_ready": readiness.collection_ready,
                "blocker_reason": readiness.collection_blocker_reason if account.is_active else None,
                "recommended_action": readiness.recommended_action if account.is_active else "Inactive finance account is ignored by live collection selectors.",
            }
        )
    return rows, counts


def _policy_governance_section() -> dict[str, Any]:
    coverage = build_policy_coverage_matrix()
    rows = coverage["results"]
    public_missing = sum(1 for row in rows if row["visibility"] == "PUBLIC" and row["status"] == "MISSING")
    public_not_published = sum(1 for row in rows if row["visibility"] == "PUBLIC" and row["status"] != "PUBLISHED")
    internal_missing = sum(1 for row in rows if row["visibility"] == "INTERNAL" and row["status"] == "MISSING")
    internal_draft = sum(1 for row in rows if row["visibility"] == "INTERNAL" and row["status"] == "DRAFT")

    blockers: list[str] = []
    warnings: list[str] = []
    if public_missing:
        blockers.append(f"{public_missing} required public policy template(s) are missing.")
    if public_not_published:
        blockers.append(f"{public_not_published} required public policy template(s) are not published.")
    if internal_missing:
        warnings.append(f"{internal_missing} internal governance policy template(s) are missing.")
    if internal_draft:
        warnings.append(f"{internal_draft} internal governance policy template(s) are still draft.")

    return _section(
        key="policy_governance",
        title="Policy Governance",
        status=_status_from(blockers, warnings),
        blockers=blockers,
        warnings=warnings,
        recommended_action="Seed missing templates, review policy text, publish required public policies, and approve/internalize governance policies before launch.",
        target_route="/admin/settings/policies",
        why_this_matters="Public launch must not expose draft/internal policies. Customer-facing policies require publication, while internal governance policies support audit and controls.",
        metadata={
            "coverage_summary": coverage["summary"],
            "public_missing_count": public_missing,
            "public_not_published_count": public_not_published,
            "internal_missing_count": internal_missing,
            "internal_draft_count": internal_draft,
        },
    )


def _business_compliance_section() -> dict[str, Any]:
    readiness = build_business_compliance_readiness()
    return _section(
        key="business_compliance",
        title="Business Compliance",
        status=readiness["status"],
        blockers=readiness["blockers"],
        warnings=readiness["warnings"],
        recommended_action="Complete business profile, seed compliance checklist rows, upload real evidence, submit documents for review, approve required proof documents, and approve public-safe summaries separately.",
        target_route=readiness["route_hint"],
        why_this_matters="Shop identity, premises proof, tax identity, bank proof, and public-safe compliance summaries protect customer trust without exposing private documents.",
        metadata={
            "missing_required_count": readiness["missing_required_count"],
            "pending_review_count": readiness["pending_review_count"],
            "approved_required_count": readiness["approved_required_count"],
            "required_count": readiness["required_count"],
            "recommended_missing_count": readiness["recommended_missing_count"],
            "rejected_count": readiness.get("rejected_count", 0),
            "expired_count": readiness.get("expired_count", 0),
            "missing_file_count": readiness.get("missing_file_count", 0),
            "public_summary_pending_count": readiness.get("public_summary_pending_count", 0),
            "route_hint": readiness["route_hint"],
            "privacy_rule": readiness["privacy_rule"],
            "required_checks": readiness["required_checks"],
            "recommended_checks": readiness["recommended_checks"],
        },
    )


def get_setup_readiness() -> dict[str, Any]:
    """Return an admin-only, read-only business setup readiness payload."""

    User = get_user_model()

    active_business_profile = BusinessProfile.objects.filter(is_active=True).first()
    active_print_settings = DocumentPrintSettings.objects.filter(is_active=True).first()
    active_tax_profile = BusinessTaxProfile.objects.filter(is_active=True).order_by("-effective_from", "-id").first()

    required_coa_missing = AccountingSetupService.missing_required_coa_codes()
    required_mappings_missing = AccountingSetupService.missing_required_mapping_purposes()

    active_chart_accounts = ChartOfAccount.objects.filter(is_active=True)
    collection_mappings = FinanceAccountCoaMapping.objects.filter(
        is_active=True,
        purpose__in=[
            FinanceAccountMappingPurpose.CASH_COLLECTION,
            FinanceAccountMappingPurpose.BANK_COLLECTION,
            FinanceAccountMappingPurpose.UPI_COLLECTION,
            FinanceAccountMappingPurpose.PAYMENT_GATEWAY_COLLECTION,
        ],
    )
    posting_profiles_count = AccountingPostingProfile.objects.filter(is_active=True).count()

    active_branches = Branch.objects.filter(status=BranchStatus.ACTIVE)
    primary_branch_exists = active_branches.filter(is_primary=True).exists()
    active_counters = CashCounter.objects.filter(is_active=True)

    active_products = Product.objects.filter(is_active=True)
    batches = Batch.objects.all()
    lucky_ids = LuckyId.objects.all()

    admin_users = User.objects.filter(is_active=True, role=UserRole.ADMIN)
    cashier_users = User.objects.filter(is_active=True, role=UserRole.CASHIER)

    numbering_ready, numbering_metadata = _document_numbering_ready()
    finance_rows, finance_counts = _finance_account_rows()
    ready_collection_account_exists = finance_counts["ready"] > 0
    active_finance_blockers = finance_counts["active_blocked"]

    document_terms = []
    if active_print_settings:
        document_terms = [
            active_print_settings.invoice_terms,
            active_print_settings.receipt_terms,
            active_print_settings.delivery_challan_terms,
            active_print_settings.subscription_contract_terms,
            active_print_settings.rent_lease_contract_terms,
            active_print_settings.account_statement_terms,
        ]
    document_terms_configured = any((term or "").strip() for term in document_terms)

    finance_warnings = []
    if active_finance_blockers:
        finance_warnings.append(f"{active_finance_blockers} active finance account(s) are not collection-ready.")

    sections = [
        _section(
            key="business_profile",
            title="Business Profile",
            status="READY" if active_business_profile else "BLOCKED",
            blockers=[] if active_business_profile else ["Active business profile is missing."],
            recommended_action="Review legal name, trade name, address, phone, email, and invoice defaults." if active_business_profile else "Configure the active business profile before live billing or customer onboarding.",
            target_route="/admin/settings/business-setup/profile",
            why_this_matters="Receipts, contracts, invoices, statements, public business data, and audit documents need a reliable business identity.",
            metadata={"configured": bool(active_business_profile)},
        ),
        _section(
            key="print_branding",
            title="Print Branding",
            status="READY" if active_print_settings and (active_print_settings.business_name or active_print_settings.print_phone or active_print_settings.print_address) else "NEEDS_SETUP",
            warnings=[] if active_print_settings and (active_print_settings.business_name or active_print_settings.print_phone or active_print_settings.print_address) else ["Print branding is using fallback or incomplete display details."],
            recommended_action="Set print business name, phone/address, logo preference, signature labels, and print density.",
            target_route="/admin/settings/business-setup/print-branding",
            why_this_matters="Browser/PDF documents are evidence documents. Branding must not override backend truth, but it must be clear for customers and auditors.",
            metadata={"configured": bool(active_print_settings), "logo_present": bool(getattr(active_print_settings, "business_logo", None))},
        ),
        _business_compliance_section(),
        _policy_governance_section(),
        _section(
            key="chart_of_accounts",
            title="Chart of Accounts",
            status="READY" if not required_coa_missing else "BLOCKED",
            blockers=[] if not required_coa_missing else [f"Missing required COA account(s): {', '.join(required_coa_missing)}"],
            recommended_action="Seed default accounting setup and review account names before live posting.",
            target_route="/admin/accounting/setup",
            why_this_matters="Payment collection, receipts, invoices, reversals, settlements, deposits, and reconciliation require stable posting accounts.",
            metadata={"active_accounts": active_chart_accounts.count(), "missing_required_codes": required_coa_missing},
        ),
        _section(
            key="finance_accounts",
            title="Finance Accounts",
            status="READY" if ready_collection_account_exists and active_finance_blockers == 0 else ("NEEDS_SETUP" if ready_collection_account_exists else "BLOCKED"),
            blockers=[] if ready_collection_account_exists else ["No collection-ready cash/bank/UPI finance account is mapped to a posting-enabled leaf ASSET account."],
            warnings=finance_warnings,
            recommended_action="Map each active real cash, bank, and UPI account to a posting-enabled leaf ASSET chart account. Inactive finance accounts are archived and ignored by live collection selectors.",
            target_route="/admin/accounting/chart-of-accounts",
            why_this_matters="Cashier/admin collection selectors must show only accounts that can safely post, reconcile, and day-close.",
            metadata=finance_counts,
        ),
        _section(
            key="branch_cash_counter",
            title="Branch & Cash Counter",
            status="READY" if primary_branch_exists and active_counters.exists() else "BLOCKED",
            blockers=[] if primary_branch_exists and active_counters.exists() else ["Primary active branch or active cash counter is missing."],
            recommended_action="Create/activate the primary branch and at least one collection counter before cashier operations.",
            target_route="/admin/settings/business-setup/branches",
            why_this_matters="Daily collection, cashier assignment, receipt source, and day-close need branch/counter context.",
            metadata={"active_branches": active_branches.count(), "primary_branch_exists": primary_branch_exists, "active_counters": active_counters.count()},
        ),
        _section(
            key="staff_roles",
            title="Staff Roles",
            status="READY" if admin_users.exists() and cashier_users.exists() else "NEEDS_SETUP",
            warnings=[] if admin_users.exists() and cashier_users.exists() else ["Admin or cashier role separation is incomplete."],
            recommended_action="Keep admin and cashier as internal roles only. Assign cashier users for daily collection without granting admin privileges.",
            target_route="/admin/settings/users",
            why_this_matters="Role separation protects payment approval, cancellation, reversal, and setup changes.",
            metadata={"admin_users": admin_users.count(), "cashier_users": cashier_users.count()},
        ),
        _section(
            key="product_catalog",
            title="Product Catalog",
            status="READY" if active_products.exists() else "BLOCKED",
            blockers=[] if active_products.exists() else ["No active products exist."],
            recommended_action="Create active products with correct base price before EMI/rent/lease/direct-sale workflows.",
            target_route="/admin/products",
            why_this_matters="Product base price is the contract price source for Lucky Plan EMI and supports future rent/lease asset mapping.",
            metadata={"active_products": active_products.count()},
        ),
        _section(
            key="batch_lucky_ids",
            title="Batch & Lucky IDs",
            status="READY" if batches.exists() and lucky_ids.exists() else "NEEDS_SETUP",
            warnings=[] if batches.exists() and lucky_ids.exists() else ["Lucky Plan batch or Lucky IDs are not configured."],
            recommended_action="Create batches and Lucky IDs before selling Lucky Plan subscriptions. Rent/lease flows do not require Lucky IDs.",
            target_route="/admin/batches",
            why_this_matters="Lucky Plan operations require controlled Lucky ID assignment and draw traceability.",
            metadata={"batches": batches.count(), "lucky_ids": lucky_ids.count()},
        ),
        _section(
            key="payment_collection",
            title="Payment Collection",
            status="READY" if ready_collection_account_exists else "BLOCKED",
            blockers=[] if ready_collection_account_exists else ["No collection-ready finance account exists for payment posting."],
            recommended_action="Configure at least one active cash/bank/UPI collection account and verify cashier collection selectors.",
            target_route="/admin/finance/collect",
            why_this_matters="Customer payment collection must post to valid accounts with receipt and reconciliation traceability.",
            metadata={"collection_ready_accounts": finance_counts["ready"], "collection_mappings": collection_mappings.count()},
        ),
        _section(
            key="document_templates",
            title="Document Templates & Numbering",
            status="READY" if numbering_ready and document_terms_configured else "NEEDS_SETUP",
            warnings=[] if numbering_ready and document_terms_configured else ["Document numbering or print terms are incomplete."],
            recommended_action="Configure invoice/receipt/contract numbering and print terms before launch.",
            target_route="/admin/settings/business-setup/document-numbering",
            why_this_matters="Contracts, receipts, invoices, delivery handovers, and statements need stable numbering and print terms.",
            metadata={**numbering_metadata, "document_terms_configured": document_terms_configured},
        ),
        _section(
            key="accounting_reconciliation",
            title="Accounting & Reconciliation",
            status="READY" if not required_coa_missing and not required_mappings_missing and posting_profiles_count else "BLOCKED",
            blockers=[] if not required_coa_missing and not required_mappings_missing and posting_profiles_count else ["Accounting setup, posting profiles, or reconciliation mappings are incomplete."],
            recommended_action="Finish accounting setup, posting profiles, and mapping diagnostics before using live financial workflows.",
            target_route="/admin/accounting/control-center",
            why_this_matters="Financial correctness depends on explicit posting profiles and reconciliation evidence.",
            metadata={"missing_mapping_purposes": required_mappings_missing, "posting_profiles": posting_profiles_count, "tax_profile_configured": bool(active_tax_profile)},
        ),
        _section(
            key="amendment_recontract",
            title="Amendment / Product Recontract",
            status="READY" if ContractAmendment.objects.exists() or ContractRecontractEvent.objects.exists() else "NEEDS_SETUP",
            warnings=[] if ContractAmendment.objects.exists() or ContractRecontractEvent.objects.exists() else ["No amendment/recontract records exist yet. This is normal before first use."],
            recommended_action="Use amendment workflow only after customer consent, admin approval, accounting bridge evidence, reconciliation evidence, and document evidence exist.",
            target_route="/admin/contract-amendments",
            why_this_matters="Product changes, Lucky ID/batch changes, and future EMI recalculation require strict audit and no silent source mutation.",
            metadata={"contract_amendments": ContractAmendment.objects.count(), "recontract_events": ContractRecontractEvent.objects.count()},
        ),
    ]

    ready_count = sum(1 for section in sections if section["status"] == "READY")
    warning_count = sum(1 for section in sections if section["status"] == "NEEDS_SETUP")
    blocker_count = sum(1 for section in sections if section["status"] == "BLOCKED")
    first_not_ready = next((section for section in sections if section["status"] != "READY"), None)

    launch_checklist = [
        {"key": "can_create_customer", "label": "Can create customer", "ready": bool(active_business_profile), "source_section": "business_profile"},
        {"key": "can_create_product", "label": "Can create product", "ready": active_products.exists(), "source_section": "product_catalog"},
        {"key": "can_create_batch_lucky_ids", "label": "Can create batch / Lucky IDs", "ready": batches.exists() and lucky_ids.exists(), "source_section": "batch_lucky_ids"},
        {"key": "can_collect_payment", "label": "Can collect payment", "ready": ready_collection_account_exists, "source_section": "payment_collection"},
        {"key": "can_issue_receipt", "label": "Can issue receipt", "ready": ready_collection_account_exists and numbering_ready, "source_section": "document_templates"},
        {"key": "can_print_documents", "label": "Can print documents", "ready": bool(active_print_settings), "source_section": "print_branding"},
        {"key": "can_complete_business_compliance", "label": "Can complete business compliance", "ready": sections[2]["status"] == "READY", "source_section": "business_compliance"},
        {"key": "can_publish_public_policies", "label": "Can publish public policies", "ready": sections[3]["status"] == "READY", "source_section": "policy_governance"},
        {"key": "can_reconcile", "label": "Can reconcile", "ready": not required_coa_missing and not required_mappings_missing and bool(posting_profiles_count), "source_section": "accounting_reconciliation"},
        {"key": "can_day_close", "label": "Can day-close", "ready": ready_collection_account_exists and active_counters.exists(), "source_section": "branch_cash_counter"},
        {"key": "can_handle_amendment_recontract", "label": "Can handle amendment/recontract", "ready": not required_coa_missing and not required_mappings_missing, "source_section": "amendment_recontract"},
    ]

    overall_status = "BLOCKED" if blocker_count else ("NEEDS_SETUP" if warning_count else "READY")

    return {
        "summary": {
            "overall_status": overall_status,
            "ready_count": ready_count,
            "warning_count": warning_count,
            "blocker_count": blocker_count,
            "next_recommended_action": first_not_ready["recommended_action"] if first_not_ready else "Setup is ready for controlled live operations.",
            "next_target_route": first_not_ready["target_route"] if first_not_ready else "/admin",
        },
        "sections": sections,
        "finance_accounts": finance_rows,
        "launch_checklist": launch_checklist,
        "read_only": True,
        "mutation_policy": "This endpoint is read-only. It does not seed, repair, approve, post, reconcile, reset, or mutate historical records.",
    }
