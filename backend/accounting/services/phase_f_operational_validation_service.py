from __future__ import annotations

from accounting.services.accounting_bridge_reconciliation_read_service import annotate_phase_f_row_actions


def validate_phase_f_operational_rows(rows: list[dict] | None = None) -> dict:
    """Read-only Phase-F validation matrix; never posts or mutates source records."""
    annotated = [annotate_phase_f_row_actions({**row, "can_post": False, "can_preview": False}) for row in (rows or [])]
    return {
        "read_only": True,
        "can_post": False,
        "can_preview": False,
        "creates_journal_entries": False,
        "creates_bridge_postings": False,
        "mutates_source_records": False,
        "rows": annotated,
    }
