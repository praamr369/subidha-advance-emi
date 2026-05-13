from __future__ import annotations

from decimal import Decimal

from accounting.services.tax_profile_service import build_tax_profile_snapshot
from accounting.services.tax_guard_service import is_gst_registered_mode

MONEY_ZERO = Decimal("0.00")


def build_purchase_tax_snapshot(*, purchase_bill) -> dict:
    supplier_gst_paid = Decimal(str(getattr(purchase_bill, "tax_total", MONEY_ZERO) or MONEY_ZERO)).quantize(Decimal("0.01"))
    itc_claimable = bool(is_gst_registered_mode() and supplier_gst_paid > MONEY_ZERO)
    snapshot = build_tax_profile_snapshot(on_date=getattr(purchase_bill, "bill_date", None))
    snapshot.update(
        {
            "supplier_gst_paid": f"{supplier_gst_paid:.2f}",
            "itc_claimable": itc_claimable,
            "supplier_gst_as_cost": not itc_claimable and supplier_gst_paid > MONEY_ZERO,
            "posting_hint": "INPUT_GST_BLOCKED_TO_COST" if not itc_claimable else "INPUT_GST_ALLOWED",
        }
    )
    return snapshot


def should_post_input_gst() -> bool:
    return is_gst_registered_mode()
