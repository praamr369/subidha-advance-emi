from __future__ import annotations

from typing import Any

from django.apps import apps
from django.contrib.auth import get_user_model

from accounting.models import (
    AccountingPostingProfile,
    BusinessTaxProfile,
    ChartOfAccount,
    FinanceAccount,
    FinanceAccountCoaMapping,
    FinanceAccountMappingPurpose,
)
from accounting.services.accounting_setup_catalog import CANONICAL_CHART_ACCOUNT_BY_KEY
from accounting.services.accounting_setup_service import AccountingSetupService
from accounting.services.finance_account_readiness import finance_account_readiness
from accounts.models import UserRole
from branch_control.models import Branch, BranchStatus, CashCounter
from inventory.models import InventoryItem, StockLedger, StockMovementType
from subscriptions.models import Batch, ContractAmendment, ContractRecontractEvent, LuckyId, Product
from subscriptions.models_business_setup import BusinessProfile
from subscriptions.models_document_print_settings import DocumentPrintSettings
from subscriptions.services.business_compliance_governance_service import build_business_compliance_readiness
from subscriptions.services.document_numbering_service import get_document_numbering_state, required_numbering_keys_for_checklist
from subscriptions.services.policy_governance_service import build_policy_coverage_matrix

ReadinessStatus = str

CORE_REQUIRED = "CORE_REQUIRED"
FINANCE_ACCOUNTING_REQUIRED = "FINANCE_ACCOUNTING_REQUIRED"
RENT_LEASE_REQUIRED = "RENT_LEASE_REQUIRED"
DIRECT_SALE_REQUIRED = "DIRECT_SALE_REQUIRED"
SUBSCRIPTION_EMI_REQUIRED = "SUBSCRIPTION_EMI_REQUIRED"
INVENTORY_REQUIRED = "INVENTORY_REQUIRED"
STAFF_HR_PAYROLL_REQUIRED = "STAFF_HR_PAYROLL_REQUIRED"
CRM_REQUIRED = "CRM_REQUIRED"
RESET_DRY_RUN_REQUIRED = "RESET_DRY_RUN_REQUIRED"
OPTIONAL_OR_FUTURE = "OPTIONAL_OR_FUTURE"

CATEGORY_LABELS = {
    CORE_REQUIRED: "Core Setup",
    FINANCE_ACCOUNTING_REQUIRED: "Finance & Accounting",
    RENT_LEASE_REQUIRED: "Rent / Lease Live Setup",
    DIRECT_SALE_REQUIRED: "Direct Sale",
    SUBSCRIPTION_EMI_REQUIRED: "Subscription EMI",
    INVENTORY_REQUIRED: "Inventory",
    STAFF_HR_PAYROLL_REQUIRED: "Staff / HR / Payroll",
    CRM_REQUIRED: "CRM",
    RESET_DRY_RUN_REQUIRED: "Reset / Dry Run",
    OPTIONAL_OR_FUTURE: "Optional / Future",
}

# Core collection can become operational without fake stock or completed payroll/CRM enrichment.
CORE_OPERATIONAL_CATEGORIES = {
    CORE_REQUIRED,
    FINANCE_ACCOUNTING_REQUIRED,
    RENT_LEASE_REQUIRED,
    DIRECT_SALE_REQUIRED,
    SUBSCRIPTION_EMI_REQUIRED,
    RESET_DRY_RUN_REQUIRED,
}


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
    category: str,
    repairable: bool = False,
    optional_for_initial_start: bool = False,
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
        "category": category,
        "category_label": CATEGORY_LABELS.get(category, category.replace("_", " ").title()),
        "repairable": repairable,
        "optional_for_initial_start": optional_for_initial_start,
        "last_checked": None,
        "metadata": metadata or {},
    }


def _status_from(blockers: list[str], warnings: list[str], *, pending_status: str = "REQUIRED_PENDING") -> ReadinessStatus:
    if blockers:
        return "BLOCKED"
    if warnings:
        return pending_status
    return "READY"


def _model_exists(app_label: str, model_name: str) -> bool:
    try:
        apps.get_model(app_label, model_name)
        return True
    except LookupError:
        return False


def _active_system_account_exists(key: str) -> bool:
    spec = CANONICAL_CHART_ACCOUNT_BY_KEY.get(key)
    if spec is None:
        return False
    return ChartOfAccount.objects.filter(system_code=key, is_active=True).exists() or ChartOfAccount.objects.filter(code__iexact=spec.code, is_active=True).exists()


def _document_numbering_ready() -> tuple[bool, dict[str, Any]]:
    numbering_state = get_document_numbering_state()
    required_keys = set(required_numbering_keys_for_checklist())
    rows = [row for row in numbering_state["sequences"] if row["key"] in required_keys]
    configured = all(row["configured"] for row in rows)
    preview_ready = all((row.get("next_number_preview") or row.get("preview_number") or "").strip() for row in rows if row["configured"])
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
    rows: list[dict[str, Any]] = []
    counts = {"total": 0, "active": 0, "inactive": 0, "ready": 0, "active_blocked": 0, "blocked": 0, "inactive_not_ready": 0, "cash_ready": 0, "bank_ready": 0, "upi_ready": 0}
    accounts = FinanceAccount.objects.select_related("chart_account", "branch").order_by("kind", "name", "id")
    for account in accounts:
        counts["total"] += 1
        counts["active" if account.is_active else "inactive"] += 1
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
        rows.append({
            "id": account.id,
            "name": account.name,
            "kind": account.kind,
            "is_active": account.is_active,
            "diagnostic_only": readiness.diagnostic_only,
            "branch": getattr(account.branch, "name", None) if account.branch_id else None,
            "mapped_chart_account": ({"id": chart.id, "code": chart.code, "name": chart.name, "account_type": chart.account_type, "allow_manual_posting": chart.allow_manual_posting, "is_active": chart.is_active} if chart else None),
            "posting_ready": readiness.collection_ready,
            "collection_ready": readiness.collection_ready,
            "blocker_reason": readiness.collection_blocker_reason if account.is_active else None,
            "recommended_action": readiness.recommended_action if account.is_active else "Inactive finance account is ignored by live collection selectors.",
        })
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
    return _section(key="policy_governance", title="Policy Governance", status=_status_from(blockers, warnings), blockers=blockers, warnings=warnings, recommended_action="Seed missing templates, review policy text, publish required public policies, and approve/internalize governance policies before launch.", target_route="/admin/settings/policies", why_this_matters="Public launch must not expose draft/internal policies. Customer-facing policies require publication, while internal governance policies support audit and controls.", category=OPTIONAL_OR_FUTURE, optional_for_initial_start=True, metadata={"coverage_summary": coverage["summary"], "public_missing_count": public_missing, "public_not_published_count": public_not_published, "internal_missing_count": internal_missing, "internal_draft_count": internal_draft})


def _business_compliance_section() -> dict[str, Any]:
    readiness = build_business_compliance_readiness()
    return _section(key="business_compliance", title="Business Documentation", status=readiness["status"], blockers=readiness["blockers"], warnings=readiness["warnings"], recommended_action="Complete business profile, GST/non-GST posture, MSME/Udyam/PAN evidence where available, print terms, and public-safe compliance summaries.", target_route=readiness["route_hint"], why_this_matters="Shop identity, premises proof, tax identity, bank proof, invoice footer, and public-safe compliance summaries protect customer trust without exposing private documents.", category=CORE_REQUIRED, optional_for_initial_start=True, metadata={"missing_required_count": readiness["missing_required_count"], "pending_required_count": readiness.get("pending_required_count", 0), "pending_review_count": readiness["pending_review_count"], "approved_required_count": readiness["approved_required_count"], "required_count": readiness["required_count"], "recommended_missing_count": readiness["recommended_missing_count"], "route_hint": readiness["route_hint"], "privacy_rule": readiness["privacy_rule"]})


def _inventory_onboarding_section(active_products) -> dict[str, Any]:
    inventory_profiles = InventoryItem.objects.filter(is_active=True)
    stock_ledgers = StockLedger.objects.all()
    opening_ledger_count = stock_ledgers.filter(movement_type=StockMovementType.OPENING_BALANCE_IN).count()
    product_count = active_products.count()
    profile_count = inventory_profiles.count()
    stock_entered = bool(profile_count and (opening_ledger_count or inventory_profiles.exclude(opening_stock_qty=0).exists()))
    status = "READY" if stock_entered else "REQUIRED_PENDING"
    warnings = [] if stock_entered else [
        "Inventory opening stock is pending. Stock CSV upload is an admin workflow but is not required for starting core collection.",
        "Do not mark stock ready until manual opening stock or confirmed CSV import creates real stock records.",
    ]
    return _section(
        key="inventory_onboarding",
        title="Inventory Opening Stock & CSV Onboarding",
        status=status,
        warnings=warnings,
        recommended_action="Open inventory readiness, prepare inventory profiles, enter opening stock manually, or run CSV preview + confirmed import when available.",
        target_route="/admin/inventory/opening-stock",
        why_this_matters="Inventory is required as an admin workflow. Missing quantity must stay REQUIRED_PENDING; readiness must not fake stock availability or create StockLedger rows from setup/readiness.",
        category=INVENTORY_REQUIRED,
        optional_for_initial_start=True,
        metadata={
            "status_code": "READY" if stock_entered else "REQUIRED_PENDING",
            "active_products": product_count,
            "inventory_profiles": profile_count,
            "stock_ledger_entries": stock_ledgers.count(),
            "opening_stock_ledger_entries": opening_ledger_count,
            "csv_import_required_workflow": True,
            "csv_import_required_for_initial_collection": False,
            "manual_opening_stock_required_workflow": True,
            "creates_stock_ledger_from_readiness": False,
            "action_routes": ["/admin/inventory/readiness", "/admin/inventory/opening-stock", "/admin/inventory/items", "/admin/inventory/ledger"],
        },
    )


def _rent_lease_section() -> dict[str, Any]:
    try:
        from subscriptions.services.rent_lease_accounting_readiness_service import get_rent_lease_accounting_readiness

        readiness = get_rent_lease_accounting_readiness(auto_create=False)
    except Exception as exc:  # defensive: setup readiness must explain, not crash.
        return _section(key="rent_lease_live", title="Rent / Lease Live Setup", status="BLOCKED", blockers=[f"Rent/lease readiness could not be loaded: {exc}"], recommended_action="Open rent/lease cockpit and accounting setup to resolve configuration.", target_route="/admin/rent-lease", why_this_matters="Rent/Lease is live for this business and must not be treated as optional or future.", category=RENT_LEASE_REQUIRED, repairable=True)
    all_blockers = list(readiness.get("blockers") or [])
    mapping_ready = bool(readiness.get("mapping_ready"))
    collection_ready = bool(readiness.get("collection_ready"))
    period_blockers = [b for b in all_blockers if "period" in b.lower() or "accounting period" in b.lower() or "financial year" in b.lower()]
    mapping_blockers = [b for b in all_blockers if b not in period_blockers]
    blockers = mapping_blockers
    warnings: list[str] = []
    if period_blockers:
        warnings.extend(period_blockers)
    if readiness.get("posting_mode") == "AUDIT_DEFERRED" or not readiness.get("posting_bridge_approved"):
        warnings.append("Rent/lease collection workflow may be ready while bridge posting remains approval-gated.")
    status = "READY" if mapping_ready and collection_ready and not blockers else "BLOCKED"
    return _section(
        key="rent_lease_live",
        title="Rent / Lease Live Setup",
        status=status,
        blockers=blockers,
        warnings=warnings,
        recommended_action="Complete rent/lease income, lease income, security deposit liability, damage recovery, settlement FinanceAccount, monthly demand, deposit, and collection readiness.",
        target_route="/admin/rent-lease",
        why_this_matters="Rent/Lease is LIVE. Mapping, deposit workflow, monthly demand workflow, collection workflow, and bridge readiness must be visible and ready before live operation.",
        category=RENT_LEASE_REQUIRED,
        repairable=True,
        metadata={
            "mapping_ready": readiness.get("mapping_ready"),
            "collection_ready": readiness.get("collection_ready"),
            "posting_bridge_ready": readiness.get("posting_bridge_ready"),
            "posting_bridge_approved": readiness.get("posting_bridge_approved"),
            "posting_mode": readiness.get("posting_mode"),
            "status": readiness.get("status"),
            "deposit_workflow_route": "/admin/rent-lease",
            "monthly_demand_workflow_route": "/admin/rent-lease",
            "collection_workflow_route": "/admin/rent-lease",
        },
    )


def _staff_hr_payroll_section(admin_count: int, cashier_count: int) -> dict[str, Any]:
    salary_ready = _active_system_account_exists("SALARY_EXPENSE") and _active_system_account_exists("SALARY_PAYABLE")
    staff_model_exists = _model_exists("accounts", "User")
    blockers: list[str] = []
    warnings: list[str] = []
    if admin_count == 0:
        blockers.append("Active admin user is missing.")
    if not salary_ready:
        warnings.append("Salary expense/payable COA readiness is pending.")
    if cashier_count == 0:
        warnings.append("No active cashier/staff login exists yet. Create staff login before assigning staff collection or attendance work.")
    return _section(
        key="staff_hr_payroll",
        title="Staff / HR / Payroll / Payslip Readiness",
        status=_status_from(blockers, warnings),
        blockers=blockers,
        warnings=warnings,
        recommended_action="Open staff setup, create/activate staff login where needed, configure attendance, payroll, payslip readiness, and salary accounting accounts.",
        target_route="/admin/hr/staff",
        why_this_matters="Staff setup, staff login, attendance, payroll, and payslip readiness are required admin workflows. Setup must not create fake salary payments or payslips.",
        category=STAFF_HR_PAYROLL_REQUIRED,
        repairable=True,
        metadata={
            "admin_users": admin_count,
            "cashier_users": cashier_count,
            "staff_login_workflow_available": staff_model_exists,
            "attendance_route": "/admin/hr/attendance",
            "payroll_route": "/admin/hr/payroll",
            "salary_payments_route": "/admin/hr/salary-payments",
            "payslip_readiness": "WORKFLOW_REQUIRED",
            "salary_accounting_ready": salary_ready,
            "creates_salary_payments_from_setup": False,
            "creates_payslips_from_setup": False,
        },
    )


def _crm_section() -> dict[str, Any]:
    party_model_exists = _model_exists("crm", "PartyMaster")
    warnings: list[str] = []
    if not party_model_exists:
        warnings.append("CRM PartyMaster model was not detected; keep CRM enrichment pending until workflow is available.")
    return _section(
        key="crm_enrichment",
        title="CRM Enrichment",
        status="REQUIRED_PENDING" if warnings else "READY",
        warnings=warnings,
        recommended_action="Open CRM parties, leads, and follow-ups. Link customers, partners, and staff to PartyMaster where supported.",
        target_route="/admin/crm/parties",
        why_this_matters="CRM enrichment is required as an admin workflow for production setup, but setup must not create fake interactions or fake parties.",
        category=CRM_REQUIRED,
        repairable=False,
        metadata={
            "party_master_model_exists": party_model_exists,
            "crm_route": "/admin/crm",
            "party_route": "/admin/crm/parties",
            "leads_route": "/admin/crm/leads",
            "followups_route": "/admin/crm/follow-ups",
            "creates_fake_interactions_from_setup": False,
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
    collection_mappings = FinanceAccountCoaMapping.objects.filter(is_active=True, purpose__in=[FinanceAccountMappingPurpose.CASH_COLLECTION, FinanceAccountMappingPurpose.BANK_COLLECTION, FinanceAccountMappingPurpose.UPI_COLLECTION, FinanceAccountMappingPurpose.PAYMENT_GATEWAY_COLLECTION])
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
    document_terms: list[str | None] = []
    if active_print_settings:
        document_terms = [active_print_settings.invoice_terms, active_print_settings.receipt_terms, active_print_settings.delivery_challan_terms, active_print_settings.subscription_contract_terms, active_print_settings.rent_lease_contract_terms, active_print_settings.account_statement_terms]
    document_terms_configured = any((term or "").strip() for term in document_terms)
    finance_warnings: list[str] = []
    if active_finance_blockers:
        finance_warnings.append(f"{active_finance_blockers} active finance account(s) are not collection-ready.")

    direct_sale_ready = active_products.exists() and numbering_ready
    subscription_ready = active_products.exists() and batches.exists() and lucky_ids.exists() and numbering_ready
    inventory_account_ready = _active_system_account_exists("INVENTORY_ASSET") and _active_system_account_exists("PURCHASE_EXPENSE")

    sections = [
        _section(key="admin_preserved", title="Admin Preserved", status="READY" if admin_users.exists() else "BLOCKED", blockers=[] if admin_users.exists() else ["Active admin user is missing."], recommended_action="Preserve admin user, especially username subidhafurniture where configured, before destructive reset or restore.", target_route="/admin/settings/users", why_this_matters="Setup/reset controls must remain admin-only and must preserve the primary business operator.", category=CORE_REQUIRED, repairable=False, metadata={"admin_users": admin_users.count(), "preserve_username": "subidhafurniture"}),
        _section(key="business_profile", title="Business Profile", status="READY" if active_business_profile else "BLOCKED", blockers=[] if active_business_profile else ["Active business profile is missing."], recommended_action="Configure business name, legal name, optional GSTIN/PAN/Udyam/MSME, address, phone, email, website, GST/non-GST status, logo, terms, and footer text.", target_route="/admin/settings/business-setup/profile", why_this_matters="Receipts, contracts, invoices, statements, public business data, and audit documents need reliable business identity. GSTIN and website are optional in non-GST mode.", category=CORE_REQUIRED, repairable=False, metadata={"configured": bool(active_business_profile), "gstin_optional_for_non_gst": True, "website_optional": True}),
        _business_compliance_section(),
        _section(key="branch_cash_counter", title="Branch & Counter / Cash Desk", status="READY" if primary_branch_exists and active_counters.exists() else "BLOCKED", blockers=[] if primary_branch_exists and active_counters.exists() else ["Primary active branch or active cash counter is missing."], recommended_action="Create/activate the primary branch and at least one cash/UPI/bank counter before cashier operations.", target_route="/admin/settings/business-setup/cash-desks", why_this_matters="Daily collection, cashier assignment, receipt source, and day-close need branch/counter context.", category=CORE_REQUIRED, repairable=True, metadata={"active_branches": active_branches.count(), "primary_branch_exists": primary_branch_exists, "active_counters": active_counters.count()}),
        _section(key="finance_accounts", title="Cash / Bank / UPI Finance Accounts", status="READY" if ready_collection_account_exists and active_finance_blockers == 0 else ("REQUIRED_PENDING" if ready_collection_account_exists else "BLOCKED"), blockers=[] if ready_collection_account_exists else ["No collection-ready cash/bank/UPI finance account is mapped to a posting-enabled leaf ASSET account."], warnings=finance_warnings, recommended_action="Map each active real cash, bank, and UPI account to a posting-enabled leaf ASSET chart account. At least one active collection account is enough to start controlled collection.", target_route="/admin/settings/business-setup/finance-accounts", why_this_matters="Cashier/admin collection selectors must show only accounts that can safely post, reconcile, and day-close.", category=CORE_REQUIRED, repairable=True, metadata=finance_counts),
        _section(key="chart_of_accounts", title="Chart of Accounts", status="READY" if not required_coa_missing else "BLOCKED", blockers=[] if not required_coa_missing else [f"Missing required COA account(s): {', '.join(required_coa_missing)}"], recommended_action="Seed default accounting setup and review account names before live posting.", target_route="/admin/accounting/setup", why_this_matters="Payment collection, receipts, invoices, reversals, settlements, deposits, and reconciliation require stable posting accounts.", category=FINANCE_ACCOUNTING_REQUIRED, repairable=True, metadata={"active_accounts": active_chart_accounts.count(), "missing_required_codes": required_coa_missing}),
        _section(key="finance_account_coa_mapping", title="FinanceAccount to COA Mapping", status="READY" if not required_mappings_missing and collection_mappings.exists() else "BLOCKED", blockers=[] if not required_mappings_missing and collection_mappings.exists() else ["FinanceAccount to COA collection mappings are incomplete."], recommended_action="Complete cash/bank/UPI collection mappings and system posting profiles before controlled posting.", target_route="/admin/settings/business-setup/finance-accounts", why_this_matters="Collection accounts must map to real posting-enabled ASSET accounts; setup must not auto-post journals.", category=FINANCE_ACCOUNTING_REQUIRED, repairable=True, metadata={"missing_mapping_purposes": required_mappings_missing, "collection_mappings": collection_mappings.count()}),
        _section(key="accounting_bridge", title="Accounting Bridge Readiness", status="READY" if not required_coa_missing and not required_mappings_missing and posting_profiles_count else "BLOCKED", blockers=[] if not required_coa_missing and not required_mappings_missing and posting_profiles_count else ["Accounting setup, posting profiles, or reconciliation mappings are incomplete."], warnings=["Bridge posting may remain approval-gated; no journals are auto-posted by setup."], recommended_action="Review mapping audit, bridge readiness, bridge reconciliation, and approval-gated posting workflows.", target_route="/admin/accounting/bridges", why_this_matters="Financial correctness depends on explicit posting profiles and reconciliation evidence. Bridge readiness is read-only and must not auto-post journals.", category=FINANCE_ACCOUNTING_REQUIRED, repairable=True, metadata={"posting_profiles": posting_profiles_count, "tax_profile_configured": bool(active_tax_profile), "bridge_reconciliation_route": "/admin/accounting/bridge-reconciliation"}),
        _rent_lease_section(),
        _section(key="direct_sale_setup", title="Direct Sale Setup", status="READY" if direct_sale_ready else ("REQUIRED_PENDING" if active_products.exists() else "BLOCKED"), blockers=[] if active_products.exists() else ["No active products configured for direct sale."], warnings=[] if direct_sale_ready or not active_products.exists() else ["Direct-sale numbering or document readiness is not yet configured."], recommended_action="Create active products, verify direct-sale route, numbering, invoice/receipt readiness, and bridge readiness.", target_route="/admin/billing/direct-sale", why_this_matters="Direct sale is a live selling path and must use real product, invoice, receipt, and bridge readiness without changing financial semantics.", category=DIRECT_SALE_REQUIRED, repairable=True, metadata={"active_products": active_products.count(), "document_numbering_ready": numbering_ready, "route": "/admin/billing/direct-sale"}),
        _section(key="subscription_emi_setup", title="Subscription EMI / Lucky Plan Setup", status="READY" if subscription_ready else "REQUIRED_PENDING", warnings=[] if subscription_ready else ["Active products, batch/lucky IDs, or receipt/document readiness is incomplete."], recommended_action="Create active products, prepare Lucky Plan batches/Lucky IDs, verify EMI collection and receipt readiness, and keep bridge posting controlled.", target_route="/admin/subscriptions", why_this_matters="Lucky Plan EMI requires controlled product pricing, batch/Lucky ID readiness, receipts, waiver audit, and bridge readiness.", category=SUBSCRIPTION_EMI_REQUIRED, repairable=True, metadata={"active_products": active_products.count(), "batches": batches.count(), "lucky_ids": lucky_ids.count(), "document_numbering_ready": numbering_ready}),
        _section(key="inventory_accounting", title="Inventory Accounting Setup", status="READY" if inventory_account_ready else "BLOCKED", blockers=[] if inventory_account_ready else ["Inventory asset / purchase / COGS accounting setup is incomplete."], recommended_action="Open accounting setup and mapping audit. Inventory stock quantities must still be entered through manual opening stock or CSV confirmation workflows.", target_route="/admin/accounting/setup", why_this_matters="Inventory is required as an admin workflow. Accounting accounts can be ready while stock quantity remains onboarding-pending.", category=INVENTORY_REQUIRED, repairable=True, metadata={"inventory_asset_ready": _active_system_account_exists("INVENTORY_ASSET"), "purchase_expense_ready": _active_system_account_exists("PURCHASE_EXPENSE")} ),
        _inventory_onboarding_section(active_products),
        _staff_hr_payroll_section(admin_users.count(), cashier_users.count()),
        _crm_section(),
        _section(key="document_templates", title="Documents, Numbering & Print Branding", status="READY" if numbering_ready and document_terms_configured else "REQUIRED_PENDING", warnings=[] if numbering_ready and document_terms_configured else ["Document numbering, print terms, or branding are incomplete."], recommended_action="Configure invoice/receipt/contract numbering, print branding, footer text, and document terms before launch.", target_route="/admin/settings/business-setup/document-numbering", why_this_matters="Contracts, receipts, invoices, delivery handovers, and statements need stable numbering and print terms. Existing issued documents are never renumbered.", category=CORE_REQUIRED, repairable=True, metadata={**numbering_metadata, "document_terms_configured": document_terms_configured, "print_branding_configured": bool(active_print_settings)}),
        _section(key="reset_dry_run", title="Reset / Dry Run / Backup / Restore", status="READY", recommended_action="Use dry-run previews before reset. Destructive reset/restore must require typed confirmation and preserve subidhafurniture where configured.", target_route="/admin/settings/business-setup/reset", why_this_matters="Fresh-start operations need safe preview, backup/restore job lists, and typed confirmation without fake data.", category=RESET_DRY_RUN_REQUIRED, metadata={"dry_run_route": "/admin/settings/business-setup/dry-runs", "reset_route": "/admin/settings/business-setup/reset", "preserve_username": "subidhafurniture"}),
        _policy_governance_section(),
        _section(key="amendment_recontract", title="Amendment / Product Recontract", status="INFO" if not (ContractAmendment.objects.exists() or ContractRecontractEvent.objects.exists()) else "READY", warnings=[] if ContractAmendment.objects.exists() or ContractRecontractEvent.objects.exists() else ["No amendment/recontract records exist yet. This is normal before first use."], recommended_action="Use amendment workflow only after customer consent, admin approval, accounting bridge evidence, reconciliation evidence, and document evidence exist.", target_route="/admin/contract-amendments", why_this_matters="Product changes, Lucky ID/batch changes, and future EMI recalculation require strict audit and no silent source mutation.", category=OPTIONAL_OR_FUTURE, optional_for_initial_start=True, metadata={"contract_amendments": ContractAmendment.objects.count(), "recontract_events": ContractRecontractEvent.objects.count()}),
        _section(key="staff_advance_future", title="Staff Advance Workflow", status="FUTURE_UNSUPPORTED", warnings=["Staff Advance is intentionally unsupported until a real source workflow exists."], recommended_action="Do not fake Staff Advance posting readiness. Implement the real workflow before enabling posting.", target_route="/admin/accounting/bridges", why_this_matters="Unsupported future workflows must stay visible and non-postable.", category=OPTIONAL_OR_FUTURE, optional_for_initial_start=True, metadata={"posting_supported": False}),
    ]
    core_sections = [
        section
        for section in sections
        if section["category"] in CORE_OPERATIONAL_CATEGORIES and not section.get("optional_for_initial_start")
    ]
    ready_count = sum(1 for section in sections if section["status"] == "READY")
    warning_count = sum(1 for section in sections if section["status"] in {"REQUIRED_PENDING", "WARNING", "INFO", "FUTURE_UNSUPPORTED", "OPTIONAL", "APPROVAL_GATED"})
    blocker_count = sum(1 for section in core_sections if section["status"] == "BLOCKED")
    first_not_ready = next((section for section in core_sections if section["status"] == "BLOCKED"), None) or next((section for section in sections if section["status"] != "READY" and not section.get("optional_for_initial_start")), None) or next((section for section in sections if section["status"] != "READY"), None)
    category_summary: dict[str, dict[str, int]] = {}
    for category in CATEGORY_LABELS:
        rows = [section for section in sections if section["category"] == category]
        category_summary[category] = {"total": len(rows), "ready": sum(1 for row in rows if row["status"] == "READY"), "blocked": sum(1 for row in rows if row["status"] == "BLOCKED"), "info": sum(1 for row in rows if row["status"] != "READY" and row["status"] != "BLOCKED")}
    launch_checklist = [
        {"key": "can_create_customer", "label": "Can create customer", "ready": bool(active_business_profile), "source_section": "business_profile", "category": CORE_REQUIRED},
        {"key": "can_create_product", "label": "Can create product", "ready": active_products.exists(), "source_section": "direct_sale_setup", "category": DIRECT_SALE_REQUIRED},
        {"key": "can_collect_payment", "label": "Can collect payment", "ready": ready_collection_account_exists, "source_section": "finance_accounts", "category": CORE_REQUIRED},
        {"key": "can_issue_receipt", "label": "Can issue receipt", "ready": ready_collection_account_exists and numbering_ready, "source_section": "document_templates", "category": CORE_REQUIRED},
        {"key": "can_use_rent_lease", "label": "Rent/Lease live workflow visible", "ready": True, "source_section": "rent_lease_live", "category": RENT_LEASE_REQUIRED},
        {"key": "can_use_rent_lease_direct_sale_without_stock_csv", "label": "Can start core collection without stock CSV", "ready": ready_collection_account_exists and bool(active_business_profile), "source_section": "inventory_onboarding", "category": INVENTORY_REQUIRED},
        {"key": "inventory_opening_stock_required_pending", "label": "Inventory opening stock workflow visible", "ready": True, "source_section": "inventory_onboarding", "category": INVENTORY_REQUIRED},
        {"key": "staff_payroll_workflows_visible", "label": "Staff/payroll workflows visible", "ready": True, "source_section": "staff_hr_payroll", "category": STAFF_HR_PAYROLL_REQUIRED},
        {"key": "crm_enrichment_workflow_visible", "label": "CRM enrichment workflow visible", "ready": True, "source_section": "crm_enrichment", "category": CRM_REQUIRED},
        {"key": "can_reconcile", "label": "Can review bridge readiness", "ready": not required_coa_missing and not required_mappings_missing and bool(posting_profiles_count), "source_section": "accounting_bridge", "category": FINANCE_ACCOUNTING_REQUIRED},
        {"key": "can_day_close", "label": "Can day-close after collections", "ready": ready_collection_account_exists and active_counters.exists(), "source_section": "branch_cash_counter", "category": CORE_REQUIRED},
    ]
    overall_status = "BLOCKED" if blocker_count else "READY"
    return {
        "summary": {"overall_status": overall_status, "ready_count": ready_count, "warning_count": warning_count, "blocker_count": blocker_count, "next_recommended_action": first_not_ready["recommended_action"] if first_not_ready else "Setup is ready for controlled live operations.", "next_target_route": first_not_ready["target_route"] if first_not_ready else "/admin", "category_summary": category_summary, "core_operational_ready": blocker_count == 0},
        "sections": sections,
        "finance_accounts": finance_rows,
        "launch_checklist": launch_checklist,
        "categories": [{"key": key, "label": label, **category_summary[key]} for key, label in CATEGORY_LABELS.items()],
        "read_only": True,
        "mutation_policy": "This endpoint is read-only. It does not seed, repair, approve, post, reconcile, reset, create StockLedger, create salary payments, create payslips, or mutate historical records.",
    }
