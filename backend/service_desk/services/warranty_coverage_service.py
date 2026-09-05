"""Warranty coverage for a customer's product.

The customer warranty pages have called /api/v1/warranty/* since July 2026, but
those routes were never written — see the frontend/backend URL reconciliation.
This is the logic behind them.

Coverage is derived, not stored: product configuration (how long each warranty
lasts) plus the date the customer actually received the item. Storing a
computed expiry would go stale the moment a delivery date is corrected.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from django.utils import timezone


def _add_months(start: date, months: int) -> date:
    """Add calendar months, clamping to the end of the target month.

    A 12-month warranty from 31 January ends 31 January, and from 31 August
    ends 31 August — but a 6-month warranty from 31 August must land on
    28/29 February rather than overflow into March.
    """
    if months <= 0:
        return start
    total = start.month - 1 + months
    year = start.year + total // 12
    month = total % 12 + 1
    # Longest safe day for the target month.
    if month == 2:
        leap = year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
        last_day = 29 if leap else 28
    elif month in (4, 6, 9, 11):
        last_day = 30
    else:
        last_day = 31
    return date(year, month, min(start.day, last_day))


@dataclass(frozen=True)
class WarrantyCoverage:
    """What the customer's warranty page needs to render."""

    product_id: int
    product_name: str
    warranty_enabled: bool
    manufacturing_months: int
    structural_months: int
    extended_months_max: int
    purchase_date: date | None
    manufacturing_expiry: date | None
    structural_expiry: date | None
    is_manufacturing_active: bool
    is_structural_active: bool
    coverage_basis: str

    def as_dict(self) -> dict:
        return {
            "product_id": self.product_id,
            "product_name": self.product_name,
            "warranty_enabled": self.warranty_enabled,
            "manufacturing_months": self.manufacturing_months,
            "structural_months": self.structural_months,
            "extended_months_max": self.extended_months_max,
            "purchase_date": self.purchase_date.isoformat() if self.purchase_date else None,
            "manufacturing_expiry": (
                self.manufacturing_expiry.isoformat() if self.manufacturing_expiry else None
            ),
            "structural_expiry": (
                self.structural_expiry.isoformat() if self.structural_expiry else None
            ),
            "is_manufacturing_active": self.is_manufacturing_active,
            "is_structural_active": self.is_structural_active,
            # Tells the customer *why* the clock starts when it does, rather
            # than presenting an unexplained date.
            "coverage_basis": self.coverage_basis,
        }


def coverage_start_for_subscription(subscription) -> tuple[date | None, str]:
    """When warranty begins, and what that date is based on.

    Warranty runs from the date the customer took possession, not the date they
    signed up — an advance-EMI customer may pay for months before delivery, and
    starting the clock at signup would silently eat their cover.
    """
    delivery = getattr(subscription, "delivery", None)
    if delivery is not None and delivery.delivered_date:
        return delivery.delivered_date, "DELIVERED"

    # Not yet delivered: no warranty has started. Reporting the subscription
    # start date here would claim cover the customer does not have.
    return None, "AWAITING_DELIVERY"


def build_coverage(*, product, subscription=None) -> WarrantyCoverage:
    """Coverage for one product, optionally against a specific subscription."""
    today = timezone.localdate()

    manufacturing_months = int(product.warranty_months_manufacturing or 0)
    structural_months = int(product.warranty_months_structural or 0)
    extended_max = int(product.warranty_months_extended_max or 0)
    enabled = bool(product.warranty_enabled)

    purchase_date: date | None = None
    basis = "NO_SUBSCRIPTION"
    if subscription is not None:
        purchase_date, basis = coverage_start_for_subscription(subscription)

    manufacturing_expiry = (
        _add_months(purchase_date, manufacturing_months)
        if purchase_date and manufacturing_months
        else None
    )
    structural_expiry = (
        _add_months(purchase_date, structural_months)
        if purchase_date and structural_months
        else None
    )

    return WarrantyCoverage(
        product_id=product.id,
        product_name=product.name,
        warranty_enabled=enabled,
        manufacturing_months=manufacturing_months,
        structural_months=structural_months,
        extended_months_max=extended_max,
        purchase_date=purchase_date,
        manufacturing_expiry=manufacturing_expiry,
        structural_expiry=structural_expiry,
        # A disabled product carries no cover regardless of configured months,
        # and expiry day itself is still covered.
        is_manufacturing_active=bool(
            enabled and manufacturing_expiry and today <= manufacturing_expiry
        ),
        is_structural_active=bool(
            enabled and structural_expiry and today <= structural_expiry
        ),
        coverage_basis=basis,
    )
