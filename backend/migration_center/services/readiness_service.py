"""Business readiness checklist combining core setup readiness with migration state."""

from __future__ import annotations

from typing import Any

from migration_center.models import MigrationBatch, MigrationBatchStatus
from migration_center.services.reconciliation_service import overall_reconciliation


def _dataset_imported(dataset_key: str) -> bool:
    return MigrationBatch.objects.filter(
        dataset_key=dataset_key,
        status__in=[MigrationBatchStatus.IMPORTED, MigrationBatchStatus.PARTIALLY_IMPORTED],
    ).exists()


def business_readiness() -> dict[str, Any]:
    from subscriptions.services.setup_readiness_service import get_setup_readiness

    core = get_setup_readiness()
    core_sections = {section["key"]: section for section in core["sections"]}

    def core_ready(key: str) -> bool:
        section = core_sections.get(key)
        return bool(section and section["status"] == "READY")

    reconciliation = overall_reconciliation()

    items = [
        {"key": "company_created", "label": "Company Created", "ready": core_ready("business_profile"), "source": "setup"},
        {"key": "financial_year", "label": "Financial Year", "ready": bool((core_sections.get("document_templates") or {}).get("metadata", {}).get("financial_year")), "source": "setup"},
        {"key": "branches", "label": "Branches", "ready": core_ready("branch_cash_counter"), "source": "setup"},
        {"key": "counters", "label": "Counters", "ready": core_ready("branch_cash_counter"), "source": "setup"},
        {"key": "cash_accounts", "label": "Cash Accounts", "ready": (core_sections.get("finance_accounts") or {}).get("metadata", {}).get("cash_ready", 0) > 0, "source": "setup"},
        {"key": "bank_accounts", "label": "Bank Accounts", "ready": (core_sections.get("finance_accounts") or {}).get("metadata", {}).get("bank_ready", 0) > 0, "source": "setup"},
        {"key": "upi_accounts", "label": "UPI Accounts", "ready": (core_sections.get("finance_accounts") or {}).get("metadata", {}).get("upi_ready", 0) > 0, "source": "setup"},
        {"key": "customers_imported", "label": "Customers Imported", "ready": _dataset_imported("customers"), "source": "migration", "optional": True},
        {"key": "vendors_imported", "label": "Vendors Imported", "ready": _dataset_imported("vendors"), "source": "migration", "optional": True},
        {"key": "products_imported", "label": "Products Imported", "ready": _dataset_imported("products"), "source": "migration", "optional": True},
        {"key": "stock_imported", "label": "Stock Imported", "ready": _dataset_imported("opening_stock"), "source": "migration", "optional": True},
        {"key": "receivable_imported", "label": "Receivable Imported", "ready": _dataset_imported("customer_outstanding"), "source": "migration", "optional": True},
        {"key": "payable_imported", "label": "Payable Imported", "ready": _dataset_imported("vendor_outstanding"), "source": "migration", "optional": True},
        {"key": "opening_cash_verified", "label": "Opening Cash Verified", "ready": _dataset_verified("cash_opening_balance"), "source": "migration", "optional": True},
        {"key": "opening_bank_verified", "label": "Opening Bank Verified", "ready": _dataset_verified("bank_opening_balance"), "source": "migration", "optional": True},
        {"key": "opening_upi_verified", "label": "Opening UPI Verified", "ready": _dataset_verified("upi_opening_balance"), "source": "migration", "optional": True},
        {"key": "inventory_verified", "label": "Inventory Verified", "ready": core_ready("inventory_onboarding"), "source": "setup", "optional": True},
        {"key": "reconciliation_passed", "label": "Reconciliation Passed", "ready": reconciliation["all_resolved"], "source": "migration"},
    ]
    # Mandatory = core company/finance structure + resolved reconciliation.
    mandatory_ready = all(item["ready"] for item in items if not item.get("optional"))
    return {
        "items": items,
        "reconciliation": reconciliation,
        "core_overall_status": core["summary"]["overall_status"],
        "ready_for_go_live": mandatory_ready and core["summary"]["overall_status"] == "READY",
        "read_only": True,
    }


def _dataset_verified(dataset_key: str) -> bool:
    batch = (
        MigrationBatch.objects.filter(
            dataset_key=dataset_key,
            status__in=[MigrationBatchStatus.IMPORTED, MigrationBatchStatus.PARTIALLY_IMPORTED],
        )
        .order_by("-id")
        .first()
    )
    if batch is None:
        return False
    snapshot = batch.reconciliation_snapshot or {}
    if snapshot.get("expected_total") is None:
        return batch.failed_rows == 0
    return bool(snapshot.get("matched"))
