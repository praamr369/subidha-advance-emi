"""
Scheme pricing engine.

Turns the advisory config in the growth app (PlanTemplate / OfferPackage /
OfferPackageLine) into the actual numbers a customer is shown for a product:
cash price, per-scheme discounted price, monthly instalment, and — for
rent/lease — the refundable security deposit.

Business rules encoded here (kept deliberately identical to
contracts.services.rent_lease_contract_service so the quoted figure and the
figure written onto a signed contract cannot drift):

* Total payable is the product price. No scheme markup or interest — a longer
  tenure only makes each instalment smaller.
* monthly_amount = effective_price / tenure_months
* security_deposit = effective_price * percent, percent constrained to 20-30
  (rent/lease only; EMI and cash never carry a deposit).

Discounts come from OfferPackageLine and are per product AND per scheme,
because every OfferPackage hangs off a PlanTemplate that names a plan_type.
Packages are time-bounded via start_date/end_date.

This module is read-only. It never mutates Product.base_price or any contract.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Q
from django.utils import timezone

MONEY = Decimal("0.01")
ZERO = Decimal("0.00")

CASH = "CASH"
EMI = "EMI"
RENT = "RENT"
LEASE = "LEASE"

# Cash is always available; the rest are gated by the product's own flags.
SCHEME_PRODUCT_FLAG = {
    EMI: "is_emi_enabled",
    RENT: "is_rent_enabled",
    LEASE: "is_lease_enabled",
}

DEPOSIT_SCHEMES = frozenset({RENT, LEASE})

DEPOSIT_PERCENT_MIN = Decimal("20.00")
DEPOSIT_PERCENT_MAX = Decimal("30.00")

# Security deposit rises with product value: a cheaper item ties up less of the
# customer's cash, a higher-value item covers more of our replacement exposure.
# Bands stay inside the 20-30 range the contract model and DB constraint allow.
DEPOSIT_BAND_LOW_MAX = Decimal("20000.00")   # under this -> 20%
DEPOSIT_BAND_MID_MAX = Decimal("50000.00")   # up to this -> 25%, above -> 30%
DEPOSIT_PERCENT_LOW = Decimal("20.00")
DEPOSIT_PERCENT_MID = Decimal("25.00")
DEPOSIT_PERCENT_HIGH = Decimal("30.00")

# Customers type their own tenure; these are the one-tap shortcuts.
TENURE_PRESETS = (6, 12, 24, 36)
TENURE_MIN = 3
TENURE_MAX = 60


def deposit_percent_for_price(price) -> Decimal:
    """Security deposit percentage for a product value, by price band."""
    value = _q2(price)
    if value < DEPOSIT_BAND_LOW_MAX:
        return DEPOSIT_PERCENT_LOW
    if value <= DEPOSIT_BAND_MID_MAX:
        return DEPOSIT_PERCENT_MID
    return DEPOSIT_PERCENT_HIGH


def _q2(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(MONEY, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class DiscountApplication:
    """How a package changed the price, for display and for audit."""

    package_code: str
    package_name: str
    discount_type: str
    discount_value: Decimal
    price_override: Decimal | None
    amount_off: Decimal

    def as_dict(self, *, public: bool = False) -> dict:
        if public:
            # Customers see the offer's name and what they save. The internal
            # package code and the raw discount configuration stay private.
            return {
                "package_name": self.package_name,
                "amount_off": str(_q2(self.amount_off)),
            }
        return {
            "package_code": self.package_code,
            "package_name": self.package_name,
            "discount_type": self.discount_type,
            "discount_value": str(_q2(self.discount_value)),
            "price_override": str(_q2(self.price_override)) if self.price_override is not None else None,
            "amount_off": str(_q2(self.amount_off)),
        }


@dataclass(frozen=True)
class TenureQuote:
    tenure_months: int
    monthly_amount: Decimal
    security_deposit_percent: Decimal | None
    security_deposit_amount: Decimal | None
    template_code: str
    upfront_total: Decimal

    def as_dict(self) -> dict:
        return {
            "tenure_months": self.tenure_months,
            "monthly_amount": str(_q2(self.monthly_amount)),
            "security_deposit_percent": (
                str(_q2(self.security_deposit_percent))
                if self.security_deposit_percent is not None
                else None
            ),
            "security_deposit_amount": (
                str(_q2(self.security_deposit_amount))
                if self.security_deposit_amount is not None
                else None
            ),
            "upfront_total": str(_q2(self.upfront_total)),
            "template_code": self.template_code,
        }


@dataclass(frozen=True)
class SchemeQuote:
    scheme: str
    available: bool
    base_price: Decimal
    effective_price: Decimal
    discount: DiscountApplication | None
    tenures: list[TenureQuote] = field(default_factory=list)
    unavailable_reason: str = ""

    @property
    def lowest_monthly(self) -> Decimal | None:
        if not self.tenures:
            return None
        return min(t.monthly_amount for t in self.tenures)

    def as_dict(self, *, public: bool = False) -> dict:
        payload = {
            "scheme": self.scheme,
            "available": self.available,
            "base_price": str(_q2(self.base_price)),
            "effective_price": str(_q2(self.effective_price)),
            "has_discount": self.discount is not None,
            "discount": self.discount.as_dict(public=public) if self.discount else None,
            "lowest_monthly": str(_q2(self.lowest_monthly)) if self.lowest_monthly is not None else None,
            "tenures": [t.as_dict() for t in self.tenures],
        }
        if not public:
            # Says things like "Rent is not enabled for this product", which
            # restates an internal product flag. Operators may see it; the
            # public catalogue simply omits schemes it cannot offer.
            payload["unavailable_reason"] = self.unavailable_reason
        return payload


def _clamp_deposit_percent(percent) -> Decimal | None:
    """
    PlanTemplate.default_security_deposit_percent carries no range validator,
    but the contract model and DB constraint both require 20-30. Clamp rather
    than raise so one badly configured template cannot take down the public
    catalogue.
    """
    if percent is None:
        return None
    value = Decimal(str(percent)).quantize(MONEY, rounding=ROUND_HALF_UP)
    if value < DEPOSIT_PERCENT_MIN:
        return DEPOSIT_PERCENT_MIN
    if value > DEPOSIT_PERCENT_MAX:
        return DEPOSIT_PERCENT_MAX
    return value


def _live_lines_queryset(on_date, plan_type=None, product_ids=None):
    from growth.models import OfferPackageLine, OfferPackageStatus

    qs = OfferPackageLine.objects.filter(
        offer_package__status=OfferPackageStatus.ACTIVE,
        offer_package__is_public_visible=True,
        offer_package__plan_template__is_active=True,
    )
    if plan_type is not None:
        qs = qs.filter(offer_package__plan_template__plan_type=plan_type)
    if product_ids is not None:
        qs = qs.filter(product_id__in=list(product_ids))
    return (
        qs.filter(Q(offer_package__start_date__isnull=True) | Q(offer_package__start_date__lte=on_date))
        .filter(Q(offer_package__end_date__isnull=True) | Q(offer_package__end_date__gte=on_date))
        .select_related("offer_package", "offer_package__plan_template")
        .order_by("offer_package__display_priority", "offer_package__package_code")
    )


class PricingCatalog:
    """
    Per-request cache for pricing a page of products.

    Plan templates are global and offer lines can be fetched for the whole page
    at once, so a 24-product listing costs two queries instead of ~200.
    """

    def __init__(self, on_date=None, products=None):
        self.on_date = on_date or timezone.localdate()
        self._templates: dict[str, list] = {}
        self._lines: dict[tuple[int, str], list] | None = None
        self._batch_durations: list[int] | None = None
        if products is not None:
            self.prefetch(products)

    def prefetch(self, products) -> "PricingCatalog":
        ids = [p.pk for p in products if getattr(p, "pk", None)]
        self._lines = {}
        if ids:
            for line in _live_lines_queryset(self.on_date, product_ids=ids):
                key = (line.product_id, line.offer_package.plan_template.plan_type)
                self._lines.setdefault(key, []).append(line)
        return self

    def templates(self, plan_type: str) -> list:
        if plan_type not in self._templates:
            from growth.models import PlanTemplate

            self._templates[plan_type] = list(
                PlanTemplate.objects.filter(
                    plan_type=plan_type,
                    is_active=True,
                    tenure_months__isnull=False,
                    tenure_months__gt=0,
                ).order_by("tenure_months")
            )
        return self._templates[plan_type]

    def lines(self, product, plan_type: str) -> list:
        if self._lines is not None:
            return self._lines.get((product.pk, plan_type), [])
        return list(_live_lines_queryset(self.on_date, plan_type=plan_type, product_ids=[product.pk]))

    def batch_durations(self) -> list[int]:
        """Distinct tenures of Lucky Plan batches, used as EMI shortcuts."""
        if self._batch_durations is None:
            try:
                from lucky_plan.models import Batch

                self._batch_durations = sorted(
                    {
                        int(d)
                        for d in Batch.objects.filter(duration_months__gt=0).values_list(
                            "duration_months", flat=True
                        )
                        if d
                    }
                )
            except Exception:  # noqa: BLE001 - batches are an optional source
                self._batch_durations = []
        return self._batch_durations


def _apply_line(base_price: Decimal, line) -> tuple[Decimal, DiscountApplication | None]:
    """Return (effective_price, discount) for one offer line."""
    from growth.models import OfferDiscountType

    pkg = line.offer_package

    if line.price_override is not None:
        effective = _q2(line.price_override)
    elif line.discount_type == OfferDiscountType.PERCENT:
        pct = Decimal(str(line.discount_value or 0))
        effective = _q2(base_price - (base_price * pct / Decimal("100")))
    elif line.discount_type == OfferDiscountType.FLAT:
        effective = _q2(base_price - Decimal(str(line.discount_value or 0)))
    else:
        return base_price, None

    # A discount may never invert the price or exceed the product value.
    if effective < ZERO:
        effective = ZERO
    if effective >= base_price:
        return base_price, None

    return effective, DiscountApplication(
        package_code=pkg.package_code,
        package_name=pkg.name,
        discount_type=line.discount_type,
        discount_value=_q2(line.discount_value),
        price_override=_q2(line.price_override) if line.price_override is not None else None,
        amount_off=_q2(base_price - effective),
    )


def _best_price(product, plan_type: str, base_price: Decimal, catalog: "PricingCatalog"):
    """Pick the cheapest live offer for this product+scheme."""
    best_price = base_price
    best_discount = None
    for line in catalog.lines(product, plan_type):
        candidate, discount = _apply_line(base_price, line)
        if discount is not None and candidate < best_price:
            best_price, best_discount = candidate, discount
    return best_price, best_discount


def quote_tenure(
    plan_type: str,
    effective_price: Decimal,
    tenure_months: int,
    *,
    template_code: str = "",
    deposit_percent_override=None,
) -> TenureQuote:
    """
    Price one tenure. Customers type their own tenure, so this must work for any
    value in range, not just the presets.
    """
    tenure = int(tenure_months)
    if tenure < TENURE_MIN or tenure > TENURE_MAX:
        raise ValueError(f"Tenure must be between {TENURE_MIN} and {TENURE_MAX} months.")

    price = _q2(effective_price)
    monthly = _q2(price / Decimal(tenure))

    deposit_percent = None
    deposit_amount = None
    if plan_type in DEPOSIT_SCHEMES:
        deposit_percent = (
            _clamp_deposit_percent(deposit_percent_override)
            if deposit_percent_override is not None
            else deposit_percent_for_price(price)
        )
        if deposit_percent is not None:
            deposit_amount = _q2(price * deposit_percent / Decimal("100"))

    return TenureQuote(
        tenure_months=tenure,
        monthly_amount=monthly,
        security_deposit_percent=deposit_percent,
        security_deposit_amount=deposit_amount,
        template_code=template_code,
        upfront_total=_q2((deposit_amount or ZERO) + monthly),
    )


def _preset_tenures(plan_type: str, catalog: "PricingCatalog") -> list[tuple[int, str, object]]:
    """
    Tenure shortcuts to show, in priority order:
      1. Active PlanTemplates for the scheme, when an operator has configured them.
      2. For EMI, the durations of live Lucky Plan batches.
      3. Otherwise the built-in presets.
    The customer can always type a different tenure regardless.
    """
    configured = [
        (int(t.tenure_months), t.template_code, t.default_security_deposit_percent)
        for t in catalog.templates(plan_type)
    ]
    if configured:
        return configured

    if plan_type == EMI:
        for duration in catalog.batch_durations():
            configured.append((int(duration), "", None))
        if configured:
            return configured

    return [(t, "", None) for t in TENURE_PRESETS]


def _tenure_quotes(plan_type: str, effective_price: Decimal, catalog: "PricingCatalog") -> list[TenureQuote]:
    quotes: list[TenureQuote] = []
    seen: set[int] = set()
    for tenure, template_code, deposit_override in _preset_tenures(plan_type, catalog):
        if tenure in seen or tenure < TENURE_MIN or tenure > TENURE_MAX:
            continue
        seen.add(tenure)
        quotes.append(
            quote_tenure(
                plan_type,
                effective_price,
                tenure,
                template_code=template_code,
                deposit_percent_override=deposit_override,
            )
        )
    return sorted(quotes, key=lambda q: q.tenure_months)


def quote_scheme(product, plan_type: str, on_date=None, catalog: "PricingCatalog | None" = None) -> SchemeQuote:
    """Price one product under one scheme."""
    catalog = catalog or PricingCatalog(on_date=on_date)
    base_price = _q2(getattr(product, "base_price", 0))

    if plan_type == CASH:
        effective, discount = _best_price(product, CASH, base_price, catalog)
        return SchemeQuote(
            scheme=CASH,
            available=base_price > ZERO,
            base_price=base_price,
            effective_price=effective,
            discount=discount,
            tenures=[],
            unavailable_reason="" if base_price > ZERO else "Price not published.",
        )

    flag = SCHEME_PRODUCT_FLAG.get(plan_type)
    if flag and not getattr(product, flag, False):
        return SchemeQuote(
            scheme=plan_type,
            available=False,
            base_price=base_price,
            effective_price=base_price,
            discount=None,
            unavailable_reason=f"{plan_type.title()} is not enabled for this product.",
        )

    if base_price <= ZERO:
        return SchemeQuote(
            scheme=plan_type,
            available=False,
            base_price=base_price,
            effective_price=base_price,
            discount=None,
            unavailable_reason="Price not published.",
        )

    effective, discount = _best_price(product, plan_type, base_price, catalog)
    tenures = _tenure_quotes(plan_type, effective, catalog)

    # Availability follows the product's own scheme flags and having a price.
    # Tenure presets are only shortcuts, so an empty config table never makes a
    # scheme disappear from the catalogue.
    return SchemeQuote(
        scheme=plan_type,
        available=True,
        base_price=base_price,
        effective_price=effective,
        discount=discount,
        tenures=tenures,
        unavailable_reason="",
    )


def quote_product(product, on_date=None, catalog: "PricingCatalog | None" = None, public: bool = False) -> dict:
    """
    Pricing payload for one product: each scheme, its discount, and every tenure
    with its instalment and deposit.

    With `public=True` the payload is trimmed for the anonymous catalogue: only
    schemes the customer can actually choose, no internal offer codes, and no
    reasons that would restate a product's internal configuration flags.

    Pass a shared `catalog` when pricing many products to avoid re-querying
    templates and offers per row.
    """
    catalog = catalog or PricingCatalog(on_date=on_date)
    on_date = catalog.on_date
    schemes = [quote_scheme(product, s, catalog=catalog) for s in (CASH, EMI, RENT, LEASE)]
    available = [s for s in schemes if s.available]
    listed = available if public else schemes

    cash = next((s for s in schemes if s.scheme == CASH), None)
    monthlies = [s.lowest_monthly for s in available if s.lowest_monthly is not None]

    return {
        "product_id": product.pk,
        "product_code": getattr(product, "product_code", None),
        "priced_on": on_date.isoformat(),
        "cash_price": str(_q2(cash.effective_price)) if cash else None,
        "cash_base_price": str(_q2(cash.base_price)) if cash else None,
        "cash_has_discount": bool(cash and cash.discount),
        "lowest_monthly": str(_q2(min(monthlies))) if monthlies else None,
        "available_schemes": [s.scheme for s in available],
        "schemes": {s.scheme: s.as_dict(public=public) for s in listed},
        # Shared so the page can recalculate a customer-typed tenure locally and
        # still land on exactly the figures this service would produce.
        "rules": {
            "tenure_min": TENURE_MIN,
            "tenure_max": TENURE_MAX,
            "tenure_presets": list(TENURE_PRESETS),
            "deposit_schemes": sorted(DEPOSIT_SCHEMES),
            "deposit_bands": [
                {"up_to": str(_q2(DEPOSIT_BAND_LOW_MAX)), "percent": str(DEPOSIT_PERCENT_LOW)},
                {"up_to": str(_q2(DEPOSIT_BAND_MID_MAX)), "percent": str(DEPOSIT_PERCENT_MID)},
                {"up_to": None, "percent": str(DEPOSIT_PERCENT_HIGH)},
            ],
        },
    }
