from __future__ import annotations

from dataclasses import dataclass

from accounting.models import AccountingPeriod, ChartOfAccount, DocumentSequence, FinanceAccount
from accounts.models import User, UserRole
from branch_control.models import Branch, BranchStatus, CashCounter
from inventory.models import InventoryItem, StockLocation
from subscriptions.models import Batch, Product
from subscriptions.models_business_setup import BusinessProfile
from subscriptions.services.document_numbering_service import (
    get_document_numbering_state,
    required_numbering_keys_for_checklist,
)


@dataclass(frozen=True)
class ChecklistItem:
    key: str
    label: str
    level: str  # required | recommended | optional
    is_complete: bool
    detail: str
    route: str = ""
    is_warning: bool = False


def _item(*, key: str, label: str, level: str, is_complete: bool, detail: str, route: str = "", is_warning: bool = False):
    status = "complete" if is_complete else ("warning" if is_warning else "missing")
    return {
        "key": key,
        "label": label,
        "level": level,
        "status": status,
        "detail": detail,
        "route": route,
    }


def compute_setup_checklist():
    # Business profile (new additive model)
    active_profile = BusinessProfile.objects.filter(is_active=True).exists()

    # Branch control (existing core model)
    active_branches = Branch.objects.filter(status=BranchStatus.ACTIVE)
    primary_branch_exists = active_branches.filter(is_primary=True).exists()

    # Counters (existing operational cash desk mapping)
    active_counters = CashCounter.objects.filter(is_active=True)

    # Accounting (existing models)
    active_chart_accounts = ChartOfAccount.objects.filter(is_active=True)
    active_finance_accounts = FinanceAccount.objects.filter(is_active=True)
    active_periods = AccountingPeriod.objects.all()
    active_sequences = DocumentSequence.objects.filter(is_active=True)
    numbering_state = get_document_numbering_state()
    checklist_numbering_keys = set(required_numbering_keys_for_checklist())
    numbering_rows = [row for row in numbering_state["sequences"] if row["key"] in checklist_numbering_keys]
    numbering_ready = all(row["configured"] for row in numbering_rows)
    numbering_preview_ready = all((row.get("next_number_preview") or "").strip() for row in numbering_rows if row["configured"])
    no_duplicate_numbers = bool(numbering_state["checks"]["no_duplicate_issued_numbers"])

    has_cash_finance = active_finance_accounts.filter(kind="CASH").exists()
    has_bank_finance = active_finance_accounts.filter(kind="BANK").exists()
    has_upi_finance = active_finance_accounts.filter(kind="UPI").exists()
    has_bank_or_upi = has_bank_finance or has_upi_finance

    # Core masters (existing subscriptions models)
    products = Product.objects.all()
    batches = Batch.objects.all()

    # Inventory (optional, existing inventory models)
    stock_locations = StockLocation.objects.filter(is_active=True)
    inventory_items = InventoryItem.objects.filter(is_active=True)

    # Staff/users (existing accounts model)
    cashier_users = User.objects.filter(is_active=True, role=UserRole.CASHIER)
    partner_users = User.objects.filter(is_active=True, role=UserRole.PARTNER)

    items = [
        _item(
            key="business_profile",
            label="Business profile configured",
            level="required",
            is_complete=active_profile,
            detail="Active business profile is available." if active_profile else "Add legal/trade name, contact, address, and receipt/invoice defaults.",
            route="/admin/settings/business-setup/profile",
        ),
        _item(
            key="primary_branch",
            label="Primary branch configured",
            level="required",
            is_complete=primary_branch_exists,
            detail="Primary branch is set for default operations." if primary_branch_exists else "Create at least one active branch and mark one as primary.",
            route="/admin/branches",
        ),
        _item(
            key="cash_counter",
            label="Collection counter available",
            level="required",
            is_complete=active_counters.exists(),
            detail=f"{active_counters.count()} active counter(s) configured." if active_counters.exists() else "Create at least one active cash counter for collections and receipts.",
            route="/admin/counters",
        ),
        _item(
            key="chart_of_accounts",
            label="Chart of accounts configured",
            level="required",
            is_complete=active_chart_accounts.exists(),
            detail=f"{active_chart_accounts.count()} active chart account(s) configured." if active_chart_accounts.exists() else "Set up the chart of accounts to enable finance posting without touching the EMI ledger.",
            route="/admin/accounting/chart-of-accounts",
        ),
        _item(
            key="finance_accounts",
            label="Finance accounts configured (cash/bank/UPI)",
            level="required",
            is_complete=has_cash_finance and has_bank_or_upi,
            detail=(
                f"Cash: {'yes' if has_cash_finance else 'no'}, Bank: {'yes' if has_bank_finance else 'no'}, UPI: {'yes' if has_upi_finance else 'no'}."
                if active_finance_accounts.exists()
                else "Create at least one cash account and at least one bank/UPI account."
            ),
            route="/admin/accounting/chart-of-accounts",
        ),
        _item(
            key="accounting_period",
            label="Accounting period configured",
            level="recommended",
            is_complete=active_periods.exists(),
            detail=f"{active_periods.count()} period(s) configured." if active_periods.exists() else "Configure the current accounting period for clean reporting and posting controls.",
            route="/admin/accounting/periods",
            is_warning=not active_periods.exists(),
        ),
        _item(
            key="document_numbering",
            label="Document numbering configured (invoice/receipt/direct-sale invoice)",
            level="recommended",
            is_complete=numbering_ready and no_duplicate_numbers and numbering_preview_ready,
            detail=(
                "Invoice, receipt, and direct-sale numbering are configured with duplicate-safe previews."
                if numbering_ready and no_duplicate_numbers and numbering_preview_ready
                else "Open Document Numbering and configure invoice, receipt, and direct-sale sequence settings."
            ),
            route="/admin/settings/business-setup/document-numbering",
            is_warning=not (numbering_ready and no_duplicate_numbers and numbering_preview_ready),
        ),
        _item(
            key="products",
            label="Products added",
            level="required",
            is_complete=products.exists(),
            detail=f"{products.count()} product(s) available." if products.exists() else "Add at least one product/furniture item before onboarding customers.",
            route="/admin/products",
        ),
        _item(
            key="batches",
            label="Batches created (Lucky Plan)",
            level="recommended",
            is_complete=batches.exists(),
            detail=f"{batches.count()} batch(es) available." if batches.exists() else "Create at least one batch before Lucky Plan onboarding.",
            route="/admin/batches",
            is_warning=not batches.exists(),
        ),
        _item(
            key="cashier_users",
            label="Cashier user ready",
            level="recommended",
            is_complete=cashier_users.exists(),
            detail=f"{cashier_users.count()} active cashier user(s) available." if cashier_users.exists() else "Create at least one CASHIER user for daily collections.",
            route="/admin/settings/users",
            is_warning=not cashier_users.exists(),
        ),
        _item(
            key="partner_users",
            label="Partner onboarding ready",
            level="optional",
            is_complete=partner_users.exists(),
            detail=f"{partner_users.count()} active partner user(s) available." if partner_users.exists() else "Add partners only if your workflow uses partner collections/commissions.",
            route="/admin/partners",
        ),
        _item(
            key="inventory_readiness",
            label="Inventory locations and items configured",
            level="optional",
            is_complete=stock_locations.exists() and inventory_items.exists(),
            detail=(
                f"Locations: {stock_locations.count()}, Inventory items: {inventory_items.count()}."
                if (stock_locations.exists() or inventory_items.exists())
                else "Set up stock locations and inventory items if you track stock movement and deliveries through inventory."
            ),
            route="/admin/inventory",
        ),
    ]

    # Readiness is based on REQUIRED items only.
    required_items = [item for item in items if item.get("level") == "required"]
    completed_required = sum(1 for item in required_items if item["status"] == "complete")
    completed_all = sum(1 for item in items if item["status"] == "complete")

    percent_complete = int(round((completed_all / len(items)) * 100)) if items else 0
    is_ready_for_go_live = all(item["status"] == "complete" for item in required_items)

    counts = {
        "business_profile_configured": bool(active_profile),
        "branches_active": active_branches.count(),
        "branches_primary_configured": bool(primary_branch_exists),
        "cash_counters_active": active_counters.count(),
        "chart_of_accounts_active": active_chart_accounts.count(),
        "finance_accounts_active": active_finance_accounts.count(),
        "finance_accounts_cash": int(has_cash_finance),
        "finance_accounts_bank": int(has_bank_finance),
        "finance_accounts_upi": int(has_upi_finance),
        "accounting_periods": active_periods.count(),
        "document_sequences_active": active_sequences.count(),
        "invoice_numbering_configured": int(numbering_state["checks"]["invoice_numbering_configured"]),
        "receipt_numbering_configured": int(numbering_state["checks"]["receipt_numbering_configured"]),
        "direct_sale_invoice_numbering_configured": int(
            numbering_state["checks"]["direct_sale_invoice_numbering_configured"]
        ),
        "document_numbering_no_duplicates": int(numbering_state["checks"]["no_duplicate_issued_numbers"]),
        "document_numbering_preview_available": int(numbering_state["checks"]["next_number_preview_available"]),
        "products": products.count(),
        "batches": batches.count(),
        "stock_locations_active": stock_locations.count(),
        "inventory_items_active": inventory_items.count(),
        "cashier_users_active": cashier_users.count(),
        "partner_users_active": partner_users.count(),
        "required_items_total": len(required_items),
        "required_items_complete": completed_required,
    }

    return {
        "is_ready_for_go_live": is_ready_for_go_live,
        "percent_complete": percent_complete,
        "items": items,
        "counts": counts,
    }
