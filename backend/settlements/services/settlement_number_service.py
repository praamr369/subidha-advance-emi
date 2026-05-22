from __future__ import annotations

from django.utils import timezone


def _generate_reference(prefix: str) -> str:
    timestamp = timezone.now().strftime("%Y%m%d%H%M%S%f")
    return f"{prefix}-{timestamp}"


def generate_bank_statement_import_no() -> str:
    return _generate_reference("BSI")


def generate_upi_settlement_import_no() -> str:
    return _generate_reference("UPI")


def generate_cashier_day_close_no() -> str:
    return _generate_reference("CDC")

