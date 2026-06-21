from __future__ import annotations

import logging
import secrets
from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from brochures.models import (
    BrochureEnquiry,
    BrochureQuotation,
    BrochureQuotationLine,
    BrochureQuotationStatusHistory,
    ProductBrochureSettings,
)
from brochures.services.brochure_enquiry_duplicate_service import (
    normalize_phone_for_comparison,
)
from brochures.services.brochure_enquiry_lifecycle_service import (
    update_enquiry_follow_up,
    validate_status_transition as validate_enquiry_status_transition,
)
from brochures.services.brochure_quotation_pdf_service import build_brochure_quotation_pdf
from crm.models import (
    PartyInteraction,
    PartyInteractionStatus,
    PartyInteractionType,
    PartyMaster,
)
from subscriptions.models import Product

logger = logging.getLogger(__name__)
ZERO = Decimal("0.00")
SAFE_PRODUCT_SNAPSHOT_FIELDS = {
    "id",
    "product_code",
    "name",
    "category",
    "short_description",
    "public_badge",
    "sale_price",
    "monthly_rent",
    "lease_monthly_amount",
    "security_deposit",
    "availability_label",
    "public_product_url",
}

ALLOWED_STATUS_TRANSITIONS = {
    BrochureQuotation.Status.DRAFT: {
        BrochureQuotation.Status.SENT,
        BrochureQuotation.Status.CANCELLED,
    },
    BrochureQuotation.Status.SENT: {
        BrochureQuotation.Status.ACCEPTED,
        BrochureQuotation.Status.REJECTED,
        BrochureQuotation.Status.EXPIRED,
        BrochureQuotation.Status.CANCELLED,
    },
    BrochureQuotation.Status.ACCEPTED: set(),
    BrochureQuotation.Status.REJECTED: set(),
    BrochureQuotation.Status.EXPIRED: set(),
    BrochureQuotation.Status.CANCELLED: set(),
}


def generate_quotation_no() -> str:
    date_part = timezone.localdate().strftime("%Y%m%d")
    for _ in range(20):
        candidate = f"QT-BR-{date_part}-{secrets.token_hex(3).upper()}"
        if not BrochureQuotation.objects.filter(quotation_no=candidate).exists():
            return candidate
    raise RuntimeError("Unable to allocate a unique quotation number.")


def generate_public_token() -> str:
    for _ in range(20):
        candidate = secrets.token_urlsafe(36)
        if not BrochureQuotation.objects.filter(public_token=candidate).exists():
            return candidate
    raise RuntimeError("Unable to allocate a unique quotation token.")


def _decimal(value) -> Decimal:
    if value in (None, ""):
        return ZERO
    return Decimal(str(value)).quantize(Decimal("0.01"))


def _safe_snapshot(product: Product | None, existing: dict | None = None) -> dict:
    snapshot = {
        key: value
        for key, value in (existing or {}).items()
        if key in SAFE_PRODUCT_SNAPSHOT_FIELDS
    }
    if product:
        settings_row = ProductBrochureSettings.objects.filter(product=product).first()
        snapshot.update(
            {
                "id": product.id,
                "product_code": product.product_code,
                "name": product.name,
                "category": product.category,
                "sale_price": str(product.base_price),
            }
        )
        if settings_row:
            snapshot["short_description"] = (
                settings_row.short_description
                or snapshot.get("short_description", "")
            )
            snapshot["public_badge"] = (
                settings_row.public_badge or snapshot.get("public_badge", "")
            )
            if settings_row.monthly_rent is not None:
                snapshot["monthly_rent"] = str(settings_row.monthly_rent)
            if settings_row.lease_monthly_amount is not None:
                snapshot["lease_monthly_amount"] = str(
                    settings_row.lease_monthly_amount
                )
            if settings_row.security_deposit is not None:
                snapshot["security_deposit"] = str(settings_row.security_deposit)
    return snapshot


def _line_defaults(product, plan_type, snapshot):
    unit_price = _decimal(snapshot.get("sale_price"))
    monthly_amount = ZERO
    tenure_months = None
    security_deposit = _decimal(snapshot.get("security_deposit"))
    if plan_type == BrochureQuotationLine.PlanType.RENT:
        monthly_amount = _decimal(snapshot.get("monthly_rent"))
    elif plan_type == BrochureQuotationLine.PlanType.LEASE:
        monthly_amount = _decimal(snapshot.get("lease_monthly_amount"))
    elif plan_type == BrochureQuotationLine.PlanType.LUCKY_EMI:
        tenure_months = 15
        monthly_amount = (
            (unit_price / Decimal(tenure_months)).quantize(Decimal("0.01"))
            if unit_price
            else ZERO
        )
    return {
        "product_code": (
            product.product_code if product else str(snapshot.get("product_code") or "")
        ),
        "product_name": (
            product.name if product else str(snapshot.get("name") or "Product")
        ),
        "unit_price": unit_price,
        "monthly_amount": monthly_amount,
        "tenure_months": tenure_months,
        "security_deposit": security_deposit,
        "availability_label": str(snapshot.get("availability_label") or ""),
    }


def validate_and_calculate_line(line: BrochureQuotationLine) -> BrochureQuotationLine:
    quantity = int(line.quantity or 0)
    unit_price = _decimal(line.unit_price)
    monthly_amount = _decimal(line.monthly_amount)
    security_deposit = _decimal(line.security_deposit)
    discount = _decimal(line.discount_amount)
    errors = {}
    if quantity < 1:
        errors["quantity"] = "Quantity must be at least 1."
    for field, value in (
        ("unit_price", unit_price),
        ("monthly_amount", monthly_amount),
        ("security_deposit", security_deposit),
        ("discount_amount", discount),
    ):
        if value < ZERO:
            errors[field] = "Amount cannot be negative."
    if line.tenure_months is not None and line.tenure_months < 1:
        errors["tenure_months"] = "Tenure must be at least 1 month."

    if line.plan_type == BrochureQuotationLine.PlanType.DIRECT_SALE:
        gross = unit_price * quantity
    elif line.plan_type == BrochureQuotationLine.PlanType.LEASE:
        months = line.tenure_months or 1
        gross = monthly_amount * quantity * months + security_deposit * quantity
    elif line.plan_type == BrochureQuotationLine.PlanType.LUCKY_EMI:
        months = line.tenure_months or 15
        line.tenure_months = months
        gross = monthly_amount * quantity * months
    else:
        months = line.tenure_months or 1
        gross = monthly_amount * quantity * months + security_deposit * quantity
    if discount > gross:
        errors["discount_amount"] = "Discount cannot exceed the line gross amount."
    if errors:
        raise ValidationError(errors)
    line.unit_price = unit_price
    line.monthly_amount = monthly_amount
    line.security_deposit = security_deposit
    line.discount_amount = discount
    line.line_total = (gross - discount).quantize(Decimal("0.01"))
    return line


@transaction.atomic
def recalculate_quotation(quotation: BrochureQuotation) -> BrochureQuotation:
    locked = BrochureQuotation.objects.select_for_update().get(pk=quotation.pk)
    delivery_charge = _decimal(locked.delivery_charge)
    quote_discount = _decimal(locked.discount_amount)
    if delivery_charge < ZERO:
        raise ValidationError({"delivery_charge": "Delivery charge cannot be negative."})
    if quote_discount < ZERO:
        raise ValidationError({"discount_amount": "Discount cannot be negative."})

    subtotal = ZERO
    line_discount_total = ZERO
    deposit_total = ZERO
    recurring_total = ZERO
    direct_sale_total = ZERO
    projected_total = ZERO
    for line in locked.lines.select_for_update().all():
        validate_and_calculate_line(line)
        line.save(
            update_fields=[
                "unit_price",
                "monthly_amount",
                "tenure_months",
                "security_deposit",
                "discount_amount",
                "line_total",
            ]
        )
        subtotal += line.line_total + line.discount_amount
        line_discount_total += line.discount_amount
        projected_total += line.line_total
        if line.plan_type in {
            BrochureQuotationLine.PlanType.RENT,
            BrochureQuotationLine.PlanType.LEASE,
        }:
            deposit_total += line.security_deposit * line.quantity
        if line.plan_type in {
            BrochureQuotationLine.PlanType.RENT,
            BrochureQuotationLine.PlanType.LEASE,
            BrochureQuotationLine.PlanType.LUCKY_EMI,
        }:
            recurring_total += line.monthly_amount * line.quantity
        if line.plan_type == BrochureQuotationLine.PlanType.DIRECT_SALE:
            direct_sale_total += line.line_total

    amount_after_line_discounts = subtotal - line_discount_total
    if quote_discount > amount_after_line_discounts:
        raise ValidationError(
            {"discount_amount": "Quotation discount cannot exceed the quoted amount."}
        )
    grand_total = projected_total - quote_discount + delivery_charge
    payable_now_discount = min(quote_discount, direct_sale_total)
    total_payable_now = (
        direct_sale_total
        - payable_now_discount
        + deposit_total
        + delivery_charge
    )
    locked.subtotal_amount = subtotal
    locked.security_deposit_total = deposit_total
    locked.recurring_monthly_total = recurring_total
    locked.total_payable_now = total_payable_now
    locked.grand_total = grand_total
    locked.delivery_charge = delivery_charge
    locked.discount_amount = quote_discount
    locked.save(
        update_fields=[
            "subtotal_amount",
            "security_deposit_total",
            "recurring_monthly_total",
            "total_payable_now",
            "grand_total",
            "delivery_charge",
            "discount_amount",
            "updated_at",
        ]
    )
    return locked


def _create_lines(quotation, line_payloads):
    if not line_payloads:
        raise ValidationError({"lines": "Add at least one quotation line."})
    for index, payload in enumerate(line_payloads):
        product = payload.get("product")
        if product is None and payload.get("product_id"):
            product = Product.objects.filter(pk=payload["product_id"]).first()
        snapshot = _safe_snapshot(product, payload.get("product_snapshot"))
        plan_type = payload.get("plan_type") or quotation.quotation_type
        if plan_type == BrochureQuotation.QuotationType.MIXED:
            raise ValidationError({"lines": "Each mixed quotation line needs a plan type."})
        defaults = _line_defaults(product, plan_type, snapshot)
        line = BrochureQuotationLine(
            quotation=quotation,
            product=product,
            product_snapshot=snapshot,
            product_code=payload.get("product_code", defaults["product_code"]),
            product_name=payload.get("product_name", defaults["product_name"]),
            description=payload.get("description", ""),
            plan_type=plan_type,
            quantity=payload.get("quantity", 1),
            unit_price=payload.get("unit_price", defaults["unit_price"]),
            monthly_amount=payload.get("monthly_amount", defaults["monthly_amount"]),
            tenure_months=payload.get("tenure_months", defaults["tenure_months"]),
            security_deposit=payload.get(
                "security_deposit", defaults["security_deposit"]
            ),
            discount_amount=payload.get("discount_amount", ZERO),
            availability_label=payload.get(
                "availability_label", defaults["availability_label"]
            ),
            sort_order=payload.get("sort_order", (index + 1) * 10),
        )
        if not line.product_name.strip():
            raise ValidationError({"lines": "Product name is required."})
        validate_and_calculate_line(line)
        line.save()


@transaction.atomic
def create_quotation(*, payload: dict, created_by) -> BrochureQuotation:
    lines = payload.pop("lines", [])
    quotation = BrochureQuotation.objects.create(
        quotation_no=generate_quotation_no(),
        public_token=generate_public_token(),
        created_by=created_by,
        phone_normalized=normalize_phone_for_comparison(payload.get("phone", "")),
        **payload,
    )
    _create_lines(quotation, lines)
    BrochureQuotationStatusHistory.objects.create(
        quotation=quotation,
        to_status=quotation.status,
        note="Quotation draft created.",
        changed_by=created_by,
    )
    quotation = recalculate_quotation(quotation)
    record_crm_quotation_event(quotation, "CREATED", changed_by=created_by)
    return quotation


@transaction.atomic
def create_quotation_from_enquiry(*, enquiry: BrochureEnquiry, created_by):
    locked = BrochureEnquiry.objects.select_for_update().select_related("brochure").get(
        pk=enquiry.pk
    )
    plan = (
        BrochureQuotation.QuotationType.MIXED
        if locked.preferred_plan == BrochureEnquiry.PreferredPlan.NOT_SURE
        else locked.preferred_plan
    )
    lines = []
    for item in locked.products.select_related("product").all():
        line_plan = item.preferred_plan or locked.preferred_plan
        if line_plan == BrochureEnquiry.PreferredPlan.NOT_SURE:
            line_plan = BrochureQuotationLine.PlanType.DIRECT_SALE
        lines.append(
            {
                "product": item.product,
                "product_snapshot": item.product_snapshot,
                "product_code": item.brochure_product_code,
                "product_name": item.brochure_product_name,
                "description": item.notes,
                "plan_type": line_plan,
                "quantity": item.requested_quantity,
            }
        )
    quotation = create_quotation(
        payload={
            "enquiry": locked,
            "brochure": locked.brochure,
            "crm_party_id": locked.crm_party_id,
            "crm_lead_id": locked.crm_lead_id,
            "customer_name": locked.customer_name,
            "phone": locked.phone,
            "email": locked.email,
            "location": locked.location,
            "address_text": locked.address_text,
            "quotation_type": plan,
            "validity_date": timezone.localdate() + timedelta(days=7),
            "expected_delivery_date": locked.expected_delivery_date,
            "terms_text": (
                "Prices and availability require final admin confirmation. "
                "No stock is reserved by this quotation."
            ),
            "lines": lines,
        },
        created_by=created_by,
    )
    try:
        validate_enquiry_status_transition(locked.status, BrochureEnquiry.Status.QUOTED)
    except ValidationError:
        pass
    else:
        update_enquiry_follow_up(
            locked,
            changes={"status": BrochureEnquiry.Status.QUOTED},
            changed_by=created_by,
            history_note=f"Quotation {quotation.quotation_no} created.",
        )
    return quotation


@transaction.atomic
def update_quotation(*, quotation, payload, changed_by):
    locked = BrochureQuotation.objects.select_for_update().get(pk=quotation.pk)
    if locked.status != BrochureQuotation.Status.DRAFT:
        raise ValidationError({"status": "Only draft quotations can be edited."})
    lines = payload.pop("lines", None)
    for field, value in payload.items():
        setattr(locked, field, value)
    if "phone" in payload:
        locked.phone_normalized = normalize_phone_for_comparison(locked.phone)
    try:
        locked.full_clean(exclude=["pdf_file"])
    except DjangoValidationError as exc:
        raise ValidationError(exc.message_dict) from exc
    locked.save()
    if lines is not None:
        locked.lines.all().delete()
        _create_lines(locked, lines)
    return recalculate_quotation(locked)


@transaction.atomic
def transition_quotation_status(*, quotation, to_status, changed_by=None, note=""):
    locked = BrochureQuotation.objects.select_for_update().get(pk=quotation.pk)
    if to_status not in ALLOWED_STATUS_TRANSITIONS.get(locked.status, set()):
        raise ValidationError(
            {"status": f"Invalid quotation transition from {locked.status} to {to_status}."}
        )
    from_status = locked.status
    locked.status = to_status
    now = timezone.now()
    if to_status == BrochureQuotation.Status.SENT:
        locked.sent_at = now
    if to_status == BrochureQuotation.Status.ACCEPTED:
        locked.accepted_at = now
    locked.save(update_fields=["status", "sent_at", "accepted_at", "updated_at"])
    BrochureQuotationStatusHistory.objects.create(
        quotation=locked,
        from_status=from_status,
        to_status=to_status,
        note=(note or "").strip(),
        changed_by=changed_by,
    )
    record_crm_quotation_event(locked, to_status, changed_by=changed_by)
    return locked


def regenerate_quotation_pdf(quotation, *, public_url=""):
    quotation = recalculate_quotation(quotation)
    pdf_bytes = build_brochure_quotation_pdf(quotation=quotation, public_url=public_url)
    quotation.pdf_file.save(
        f"{quotation.quotation_no.lower()}.pdf",
        ContentFile(pdf_bytes),
        save=True,
    )
    return quotation


def record_crm_quotation_event(quotation, event, *, changed_by=None):
    if not quotation.crm_party_id:
        return None
    try:
        party = PartyMaster.objects.filter(pk=quotation.crm_party_id).first()
        if party is None:
            return None
        interaction, _ = PartyInteraction.objects.get_or_create(
            party=party,
            related_source_model=f"BrochureQuotation:{event}",
            related_source_pk=quotation.pk,
            defaults={
                "interaction_type": PartyInteractionType.CONTACT_NOTE,
                "status": PartyInteractionStatus.DONE,
                "completed_at": timezone.now(),
                "subject": f"Quotation {event.lower()}: {quotation.quotation_no}",
                "note": (
                    f"Quotation {quotation.quotation_no} event {event}. "
                    "This is non-financial and creates no booking or stock reservation."
                ),
                "created_by": changed_by,
            },
        )
        return interaction
    except Exception as exc:
        logger.exception(
            "Quotation CRM interaction failed for %s event %s",
            quotation.quotation_no,
            event,
        )
        warning = f"CRM interaction deferred for {event}: {exc}"[:500]
        current = (quotation.internal_note or "").strip()
        if warning not in current:
            quotation.internal_note = "\n".join(filter(None, [current, warning]))
            BrochureQuotation.objects.filter(pk=quotation.pk).update(
                internal_note=quotation.internal_note
            )
        return None
