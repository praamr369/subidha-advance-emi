from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from accounting.models import CustomerPurchaseEnquiry, CustomerPurchaseEnquiryStatus, VendorQuote
from accounting.services.vendor_quote_service import accept_vendor_quote, create_vendor_quote_request
from accounting.services.vendor_sourcing_service import suggest_vendors_for_order
from accounting.services.customer_purchase_enquiry_numbering import allocate_purchase_order_no_for_enquiry_draft
from inventory.models import InventoryItem, PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatus
from inventory.services.audit_service import log_inventory_event
from subscriptions.models import AuditLog, PublicLead


def create_customer_purchase_enquiry_from_public_lead(*, lead: PublicLead) -> CustomerPurchaseEnquiry:
    """Called after PublicLead is persisted — never charges payment or selects vendors."""
    product_name = (lead.interested_product or "").strip()
    if not product_name and lead.product_id:
        product_name = f"{lead.product.name} ({lead.product.product_code})".strip()

    enquiry = CustomerPurchaseEnquiry(
        customer=None,
        customer_name=lead.name,
        phone=lead.phone,
        email=lead.email or "",
        product=lead.product,
        product_name=product_name,
        category_text="",
        material="",
        quantity=Decimal("1.000"),
        budget_amount=lead.preferred_emi_amount,
        delivery_address="",
        city=lead.city or "",
        district="",
        state="",
        pincode="",
        status=CustomerPurchaseEnquiryStatus.NEW,
        public_lead=lead,
    )
    enquiry.save()
    return enquiry


def build_vendor_sourcing_for_enquiry(enquiry: CustomerPurchaseEnquiry) -> list[dict]:
    """Delegates to Phase 4 sourcing — read-only ranking."""
    return suggest_vendors_for_order(
        customer_pincode=enquiry.pincode,
        customer_city=enquiry.city,
        customer_district=enquiry.district,
        customer_state=enquiry.state,
        customer_branch="",
        product_id=enquiry.product_id,
        category_text=enquiry.category_text,
        product_name=enquiry.product_name,
        material=enquiry.material,
        quantity=enquiry.quantity,
        required_by=None,
        budget_amount=enquiry.budget_amount,
        include_out_of_area=False,
    )


def _rfq_base_fields_from_enquiry(enquiry: CustomerPurchaseEnquiry) -> dict:
    return {
        "source_type": "ONLINE_ORDER",
        "source_id": enquiry.pk,
        "customer": enquiry.customer,
        "customer_pincode": enquiry.pincode,
        "customer_city": enquiry.city,
        "customer_district": enquiry.district,
        "customer_state": enquiry.state,
        "product": enquiry.product,
        "product_name": enquiry.product_name,
        "category_text": enquiry.category_text,
        "quantity": enquiry.quantity,
        "budget_amount": enquiry.budget_amount,
        "required_by": None,
    }


def request_vendor_quotes_for_enquiry(
    *,
    enquiry: CustomerPurchaseEnquiry,
    vendor_ids: list[int],
    send_to_vendors: bool,
    created_by,
) -> tuple:
    """Creates VendorQuoteRequest rows tied to enquiry via ONLINE_ORDER source_id."""
    if enquiry.status == CustomerPurchaseEnquiryStatus.CANCELLED:
        raise ValueError("Cancelled enquiries cannot request vendor quotes.")
    base = _rfq_base_fields_from_enquiry(enquiry)
    req = create_vendor_quote_request(
        base_fields=base,
        vendor_ids=vendor_ids,
        send_to_vendors=send_to_vendors,
        created_by=created_by,
    )
    if enquiry.status in (
        CustomerPurchaseEnquiryStatus.NEW,
        CustomerPurchaseEnquiryStatus.SOURCING,
    ):
        enquiry.status = CustomerPurchaseEnquiryStatus.QUOTE_REQUESTED
        enquiry.save(update_fields=["status", "updated_at"])
    return req


def _ensure_quote_belongs_to_enquiry(enquiry: CustomerPurchaseEnquiry, quote: VendorQuote) -> None:
    rq = quote.quote_request
    if rq.source_type != "ONLINE_ORDER" or rq.source_id != enquiry.pk:
        raise ValueError("Quote does not belong to this enquiry.")


def _assert_vendor_eligibility(vendor, *, allow_on_hold_vendor: bool, allow_blocked_vendor: bool) -> None:
    if vendor.status == "ACTIVE" and vendor.is_active:
        return
    if vendor.status == "ON_HOLD" and allow_on_hold_vendor:
        return
    if vendor.status == "BLOCKED" and allow_blocked_vendor:
        return
    raise ValueError(
        "Vendor is not eligible for automatic selection. "
        "Use allow_on_hold_vendor / allow_blocked_vendor overrides when explicitly approved."
    )


@transaction.atomic
def select_vendor_quote_for_enquiry(
    *,
    enquiry: CustomerPurchaseEnquiry,
    vendor_quote_id: int,
    accepted_by,
    allow_on_hold_vendor: bool = False,
    allow_blocked_vendor: bool = False,
) -> VendorQuote:
    """Accept vendor quote (Phase 3) and mark enquiry VENDOR_SELECTED — no procurement posting."""
    if enquiry.status == CustomerPurchaseEnquiryStatus.CANCELLED:
        raise ValueError("Cancelled enquiries cannot select vendors.")

    quote = VendorQuote.objects.select_related("quote_request", "vendor").select_for_update().get(pk=vendor_quote_id)
    _ensure_quote_belongs_to_enquiry(enquiry, quote)
    _assert_vendor_eligibility(
        quote.vendor,
        allow_on_hold_vendor=allow_on_hold_vendor,
        allow_blocked_vendor=allow_blocked_vendor,
    )

    accepted = accept_vendor_quote(quote_pk=quote.pk, accepted_by=accepted_by)

    enquiry.selected_vendor_quote_id = accepted.pk
    enquiry.status = CustomerPurchaseEnquiryStatus.VENDOR_SELECTED
    enquiry.save(update_fields=["selected_vendor_quote", "status", "updated_at"])

    log_audit_enquiry(enquiry, accepted_by, "ONLINE_ENQUIRY_VENDOR_SELECTED", {"vendor_quote_id": accepted.pk})
    return accepted


def log_audit_enquiry(enquiry: CustomerPurchaseEnquiry, actor, event: str, metadata: dict):
    from subscriptions.services.audit_service import log_audit

    payload = {"event": event, "enquiry_id": enquiry.pk, "enquiry_no": enquiry.enquiry_no}
    payload.update(metadata)
    log_audit(
        action_type=AuditLog.ActionType.USER_UPDATED,
        instance=enquiry,
        performed_by=actor,
        metadata=payload,
    )


@transaction.atomic
def create_draft_purchase_order_from_enquiry(
    *,
    enquiry: CustomerPurchaseEnquiry,
    inventory_item_id: int,
    quantity: Decimal,
    unit_cost: Decimal,
    confirm: bool,
    performed_by,
    stock_location_id: int | None = None,
) -> tuple[PurchaseOrder, dict]:
    """
    Optional explicit draft PO — requires confirm=True.
    Does not post bills, stock movements, or payments.
    """
    if not confirm:
        raise ValueError("confirm=true is required to create a draft purchase order.")
    if enquiry.status != CustomerPurchaseEnquiryStatus.VENDOR_SELECTED:
        raise ValueError("Select a vendor quote before creating a draft purchase order.")
    if enquiry.selected_vendor_quote_id is None:
        raise ValueError("No vendor quote is linked to this enquiry.")
    if enquiry.draft_purchase_order_id:
        po = PurchaseOrder.objects.select_related("vendor").prefetch_related("lines").get(pk=enquiry.draft_purchase_order_id)
        return po, {"already_exists": True, "purchase_order_id": po.id, "po_no": po.po_no}

    quote = VendorQuote.objects.select_related("vendor").get(pk=enquiry.selected_vendor_quote_id)
    item = InventoryItem.objects.select_related("product").get(pk=inventory_item_id)

    po_no = allocate_purchase_order_no_for_enquiry_draft()
    kwargs = {
        "po_no": po_no,
        "po_date": timezone.localdate(),
        "vendor_id": quote.vendor_id,
        "status": PurchaseOrderStatus.DRAFT,
        "notes": f"Draft from online enquiry {enquiry.enquiry_no} (customer quote #{quote.pk}).",
    }
    if stock_location_id:
        kwargs["stock_location_id"] = stock_location_id

    po = PurchaseOrder(**kwargs)
    po.save()
    PurchaseOrderLine.objects.create(
        purchase_order=po,
        inventory_item=item,
        description=(enquiry.product_name or item.product.name if item.product_id else "")[:255],
        quantity=quantity,
        unit_cost=unit_cost,
        tax_amount=Decimal("0.00"),
    )

    enquiry.draft_purchase_order_id = po.pk
    enquiry.save(update_fields=["draft_purchase_order", "updated_at"])

    log_inventory_event(
        action_type=AuditLog.ActionType.PURCHASE_ORDER_CREATED,
        instance=po,
        performed_by=performed_by,
        event="PURCHASE_ORDER_DRAFT_FROM_ONLINE_ENQUIRY",
        metadata={
            "purchase_order_id": po.id,
            "po_no": po.po_no,
            "customer_purchase_enquiry_id": enquiry.pk,
            "vendor_quote_id": quote.pk,
        },
    )
    return po, {"already_exists": False, "purchase_order_id": po.id, "po_no": po.po_no}
