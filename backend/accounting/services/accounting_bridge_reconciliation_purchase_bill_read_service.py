from __future__ import annotations

from accounting.services.accounting_bridge_reconciliation_read_service import (
    BridgeReconciliationFilters,
    annotate_phase_f_row_actions,
    build_accounting_bridge_reconciliation,
)


def annotate_purchase_bill_reconciliation_row(row: dict) -> dict:
    """Read-only purchase-bill inventory row action adapter."""

    return annotate_phase_f_row_actions(row)


__all__ = [
    "BridgeReconciliationFilters",
    "annotate_purchase_bill_reconciliation_row",
    "build_accounting_bridge_reconciliation",
]
