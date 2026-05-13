from __future__ import annotations

from decimal import Decimal

from accounting.models import BusinessTaxRegistrationMode
from accounting.services.tax_profile_service import get_active_business_tax_profile

MONEY_ZERO = Decimal("0.00")


class TaxComplianceError(ValueError):
    pass


def current_tax_mode() -> str:
    return (get_active_business_tax_profile().mode or BusinessTaxRegistrationMode.GST_UNREGISTERED).strip().upper()


def is_gst_registered_mode() -> bool:
    return current_tax_mode() in {
        BusinessTaxRegistrationMode.GST_REGULAR,
        BusinessTaxRegistrationMode.GST_COMPOSITION,
    }


def assert_gst_invoice_allowed(*, operation: str = "GST invoice") -> None:
    if not is_gst_registered_mode():
        raise TaxComplianceError(f"{operation} is blocked while tax mode is GST_UNREGISTERED.")


def resolve_operational_tax_mode(*, requested_tax_mode: str | None = None) -> str:
    requested = (requested_tax_mode or "").strip().upper()
    if not is_gst_registered_mode():
        return "NON_GST"
    if requested in {"GST", "NON_GST"}:
        return requested
    return "GST"


def normalize_non_gst_breakdown(*, line: dict) -> dict:
    line["gst_rate"] = None
    line["cgst_amount"] = MONEY_ZERO
    line["sgst_amount"] = MONEY_ZERO
    line["igst_amount"] = MONEY_ZERO
    line["line_total"] = Decimal(str(line.get("taxable_value") or MONEY_ZERO)).quantize(Decimal("0.01"))
    return line
