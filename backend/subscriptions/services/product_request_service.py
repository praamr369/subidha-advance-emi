from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from accounts.models import User, UserRole
from subscriptions.models import (
    AuditLog,
    Batch,
    BatchStatus,
    Customer,
    LuckyId,
    LuckyIdStatus,
    Product,
    ProductRequest,
    ProductRequestStatus,
    ProductRequestType,
)
from subscriptions.services.audit_service import log_audit
from subscriptions.services.subscription_service import (
    create_emi_subscription,
    create_rent_subscription,
    create_lease_subscription,
)
from billing.services.billing_service import create_direct_sale


def product_request_base_queryset():
    return ProductRequest.objects.select_related(
        "requester",
        "partner",
        "customer",
        "customer__user",
        "product",
        "batch",
        "reviewed_by",
        "approved_subscription",
        "approved_direct_sale",
    ).order_by("-created_at", "-id")


def _validate_requestable_entities(
    *,
    product: Product,
    request_type: str,
    batch: Batch | None = None,
    preferred_lucky_number: int | None = None,
):
    errors = {}

    if not product.is_active:
        errors["product_id"] = "Selected product is inactive."

    if request_type == ProductRequestType.ADVANCE_EMI:
        if not getattr(product, "is_emi_enabled", True):
            errors["product_id"] = "Selected product is not open for EMI subscription requests."
        if not batch or batch.status != BatchStatus.OPEN:
            errors["batch_id"] = "Selected batch is not open for subscription requests."
        if preferred_lucky_number is None:
            errors["preferred_lucky_number"] = "Preferred lucky number is required."
        else:
            lucky = LuckyId.objects.filter(
                batch=batch,
                lucky_number=preferred_lucky_number,
            ).first()
            if lucky is None:
                errors["preferred_lucky_number"] = "Preferred lucky number is not valid for the selected batch."
            elif lucky.status != LuckyIdStatus.AVAILABLE:
                errors["preferred_lucky_number"] = "Preferred lucky number is not currently available."
    elif request_type == ProductRequestType.RENT:
        if not getattr(product, "is_rent_enabled", False):
            errors["product_id"] = "Selected product is not available for rent."
    elif request_type == ProductRequestType.LEASE:
        if not getattr(product, "is_lease_enabled", False):
            errors["product_id"] = "Selected product is not available for lease."

    if errors:
        raise ValidationError(errors)


def _snapshot_customer_fields(customer: Customer) -> dict[str, str]:
    return {
        "requested_customer_name": customer.name,
        "requested_customer_phone": customer.phone,
        "requested_customer_email": getattr(customer.user, "email", "") or "",
        "requested_customer_address": customer.address,
        "requested_customer_city": customer.city,
    }


@transaction.atomic
def create_customer_product_request(
    *,
    customer: Customer,
    requester,
    product: Product,
    request_type: str,
    batch: Batch | None = None,
    preferred_lucky_number: int | None = None,
    notes: str = "",
) -> ProductRequest:
    if customer.user_id != requester.id:
        raise ValidationError({"detail": "Customer request must use the authenticated customer profile."})

    _validate_requestable_entities(
        product=product,
        request_type=request_type,
        batch=batch,
        preferred_lucky_number=preferred_lucky_number,
    )

    request_obj = ProductRequest.objects.create(
        requester=requester,
        requester_role_snapshot=UserRole.CUSTOMER,
        customer=customer,
        product=product,
        request_type=request_type,
        batch=batch,
        preferred_lucky_number=preferred_lucky_number,
        requested_tenure_months_snapshot=batch.duration_months if batch else None,
        notes=notes or "",
        status=ProductRequestStatus.SUBMITTED,
        **_snapshot_customer_fields(customer),
    )
    return request_obj


@transaction.atomic
def create_partner_product_request(
    *,
    partner,
    product: Product,
    request_type: str,
    batch: Batch | None = None,
    preferred_lucky_number: int | None = None,
    notes: str = "",
    customer: Customer | None = None,
    requested_customer_name: str = "",
    requested_customer_phone: str = "",
    requested_customer_email: str = "",
    requested_customer_address: str = "",
    requested_customer_city: str = "",
) -> ProductRequest:
    if getattr(partner, "role", None) != UserRole.PARTNER:
        raise ValidationError({"detail": "Only partner users can create partner requests."})

    _validate_requestable_entities(
        product=product,
        request_type=request_type,
        batch=batch,
        preferred_lucky_number=preferred_lucky_number,
    )

    payload = {
        "requester": partner,
        "requester_role_snapshot": UserRole.PARTNER,
        "partner": partner,
        "customer": customer,
        "product": product,
        "request_type": request_type,
        "batch": batch,
        "preferred_lucky_number": preferred_lucky_number,
        "requested_tenure_months_snapshot": batch.duration_months if batch else None,
        "notes": notes or "",
    }

    if customer:
        payload.update(_snapshot_customer_fields(customer))
    else:
        payload.update({
            "requested_customer_name": requested_customer_name,
            "requested_customer_phone": requested_customer_phone,
            "requested_customer_email": requested_customer_email,
            "requested_customer_address": requested_customer_address,
            "requested_customer_city": requested_customer_city,
        })

    request_obj = ProductRequest.objects.create(**payload)
    return request_obj


@transaction.atomic
def approve_product_request_for_admin(
    *,
    request_id: int,
    admin: User,
    review_note: str = "",
    create_crm_lead: bool = False,
    pricing_override: dict | None = None,
) -> ProductRequest:
    """
    Approve a product request with optional pricing overrides.

    pricing_override dict can contain:
    - For DIRECT_SALE: unit_price (decimal)
    - For RENT: monthly_rent_amount (decimal)
    - For LEASE: monthly_lease_amount (decimal)
    """
    req = ProductRequest.objects.select_for_update().get(id=request_id)
    if req.status != ProductRequestStatus.SUBMITTED:
        raise ValidationError({"detail": "Only submitted requests can be approved."})

    if not req.customer_id:
        raise ValidationError({"detail": "Customer must be created and linked before approval."})

    pricing_override = pricing_override or {}

    if req.request_type == ProductRequestType.ADVANCE_EMI:
        # Create EMI Subscription
        tenure_months = req.requested_tenure_months_snapshot or (req.batch.duration_months if req.batch else 12)
        sub = create_emi_subscription(
            customer=req.customer,
            product=req.product,
            batch=req.batch,
            lucky_number=req.preferred_lucky_number,
            tenure_months=tenure_months,
            performed_by=admin,
            partner=req.partner,
        )
        req.approved_subscription = sub
    elif req.request_type == ProductRequestType.DIRECT_SALE:
        # Create Direct Sale (Draft Invoice)
        # Support pricing override for admin review
        unit_price = pricing_override.get("unit_price") if pricing_override else None
        if unit_price is None:
            unit_price = req.product.base_price

        sale = create_direct_sale(
            payload={
                "customer": req.customer,
                "customer_name_snapshot": req.requested_customer_name,
                "customer_phone_snapshot": req.requested_customer_phone,
                "customer_snapshot_email": req.requested_customer_email,
                "customer_snapshot_billing_address_line1": req.requested_customer_address,
                "customer_snapshot_city": req.requested_customer_city,
                "sale_date": timezone.now().date(),
                "status": "DRAFT",
                "lines": [
                    {
                        "product": req.product,
                        "quantity": 1,
                        "unit_price": unit_price,
                        "tax_rate": getattr(req.product, "tax_rate", 0) if hasattr(req.product, "tax_rate") else 0,
                    }
                ]
            },
            created_by=admin,
        )
        req.approved_direct_sale = sale
    elif req.request_type == ProductRequestType.RENT:
        monthly_rent = pricing_override.get("monthly_rent_amount") if pricing_override else None
        if monthly_rent is None:
            monthly_rent = getattr(req.product, "rental_monthly_price", req.product.base_price / 12)
        tenure_months = req.requested_tenure_months_snapshot or 12
        sub = create_rent_subscription(
            customer=req.customer,
            product=req.product,
            monthly_rent_amount=monthly_rent,
            tenure_months=tenure_months,
            performed_by=admin,
            partner=req.partner,
        )
        req.approved_subscription = sub
    elif req.request_type == ProductRequestType.LEASE:
        monthly_lease = pricing_override.get("monthly_lease_amount") if pricing_override else None
        if monthly_lease is None:
            monthly_lease = getattr(req.product, "lease_monthly_price", req.product.base_price / 24)
        tenure_months = req.requested_tenure_months_snapshot or 24
        sub = create_lease_subscription(
            customer=req.customer,
            product=req.product,
            monthly_lease_amount=monthly_lease,
            tenure_months=tenure_months,
            performed_by=admin,
            partner=req.partner,
        )
        req.approved_subscription = sub
    else:
        raise ValidationError({"detail": f"Approval for request type {req.request_type} is not yet implemented."})

    req.status = ProductRequestStatus.APPROVED
    req.reviewed_by = admin
    req.reviewed_at = timezone.now()
    req.review_note = review_note
    req.save()

    log_audit(
        action_type=AuditLog.ActionType.PRODUCT_REQUEST_APPROVED,
        instance=req,
        performed_by=admin,
        metadata={
            "detail": f"Admin approved product request #{req.id} ({req.request_type}). Note: {review_note}",
        },
    )

    if create_crm_lead:
        auto_create_lead_on_approval(req, admin)

    return req


@transaction.atomic
def reject_product_request_for_admin(
    *,
    request_id: int,
    admin: User,
    review_note: str,
) -> ProductRequest:
    req = ProductRequest.objects.select_for_update().get(id=request_id)
    if req.status != ProductRequestStatus.SUBMITTED:
        raise ValidationError({"detail": "Only submitted requests can be rejected."})

    req.status = ProductRequestStatus.REJECTED
    req.reviewed_by = admin
    req.reviewed_at = timezone.now()
    req.review_note = review_note
    req.save()
    log_audit(
        action_type=AuditLog.ActionType.PRODUCT_REQUEST_REJECTED,
        instance=req,
        performed_by=admin,
        metadata={
            "detail": f"Admin rejected product request #{req.id}. Note: {review_note}",
        },
    )
    return req


@transaction.atomic
def cancel_product_request(*, request_id: int, user: User) -> ProductRequest:
    req = ProductRequest.objects.select_for_update().get(id=request_id)
    if req.status not in [ProductRequestStatus.SUBMITTED, ProductRequestStatus.APPROVED]:
        raise ValidationError({"detail": "Only submitted or approved requests can be cancelled."})
    
    if req.requester_id != user.id:
        raise ValidationError({"detail": "You do not have permission to cancel this request."})

    req.status = ProductRequestStatus.CANCELLED
    req.save()
    return req


@transaction.atomic
def cancel_product_request_for_admin(*, request_id: int, admin: User, review_note: str = "") -> ProductRequest:
    """Admin can cancel any SUBMITTED request."""
    req = ProductRequest.objects.select_for_update().get(id=request_id)
    if req.status not in [ProductRequestStatus.SUBMITTED, ProductRequestStatus.APPROVED]:
        raise ValidationError({"detail": "Only submitted or approved requests can be cancelled."})

    req.status = ProductRequestStatus.CANCELLED
    req.reviewed_by = admin
    req.reviewed_at = timezone.now()
    req.review_note = review_note
    req.save()

    log_audit(
        action_type=AuditLog.ActionType.PRODUCT_REQUEST_CANCELLED,
        instance=req,
        performed_by=admin,
        metadata={
            "detail": f"Admin cancelled product request #{req.id}. Note: {review_note}",
        },
    )
    return req


@transaction.atomic
def edit_product_request_for_admin(
    *,
    request_id: int,
    admin: User,
    **fields,
) -> ProductRequest:
    """Admin can edit fields on a SUBMITTED request before decision."""
    req = ProductRequest.objects.select_for_update().get(id=request_id)
    if req.status != ProductRequestStatus.SUBMITTED:
        raise ValidationError({"detail": "Only submitted requests can be edited."})

    editable_fields = {
        "notes", "requested_customer_name", "requested_customer_phone",
        "requested_customer_email", "requested_customer_address",
        "requested_customer_city",
    }
    changed = []
    for key, value in fields.items():
        if key in editable_fields and value is not None:
            setattr(req, key, value)
            changed.append(key)

    if changed:
        req.save()
        log_audit(
            action_type=AuditLog.ActionType.PRODUCT_REQUEST_EDITED,
            instance=req,
            performed_by=admin,
            metadata={
                "detail": f"Admin edited product request #{req.id}. Changed fields: {', '.join(changed)}",
            },
        )
    return req


def auto_create_lead_on_approval(
    product_request: ProductRequest,
    admin: User,
):
    """Auto-create a CRM lead when a product request is approved (admin opted-in)."""
    from subscriptions.services.public_lead_service import (
        create_public_lead,
        complete_public_lead_conversion,
    )
    from subscriptions.models import PublicLeadIntent

    # Map request type to lead intent
    intent_map = {
        ProductRequestType.ADVANCE_EMI: PublicLeadIntent.SUBSCRIPTION,
        ProductRequestType.RENT: PublicLeadIntent.SUBSCRIPTION,
        ProductRequestType.LEASE: PublicLeadIntent.SUBSCRIPTION,
        ProductRequestType.DIRECT_SALE: PublicLeadIntent.DIRECT_SALE,
    }
    intent = intent_map.get(product_request.request_type, PublicLeadIntent.GENERAL)

    # Create the public lead
    lead = create_public_lead(
        name=product_request.requested_customer_name or product_request.customer.name,
        phone=product_request.requested_customer_phone or product_request.customer.phone,
        email=product_request.requested_customer_email or getattr(product_request.customer.user, "email", ""),
        city=product_request.requested_customer_city or product_request.customer.city,
        product=product_request.product,
        interested_product=product_request.product.name,
        intent=intent,
        notes=f"Auto-generated from approved Product Request #{product_request.id}",
    )

    # Complete conversion immediately since request is already approved
    if product_request.approved_subscription:
        complete_public_lead_conversion(
            lead=lead,
            customer=product_request.customer,
            subscription=product_request.approved_subscription,
            performed_by=admin,
        )
    elif product_request.approved_direct_sale:
        complete_public_lead_conversion(
            lead=lead,
            customer=product_request.customer,
            direct_sale=product_request.approved_direct_sale,
            performed_by=admin,
        )

    return lead


def get_product_stock_status(product_id: int) -> dict:
    """Get stock availability status for a product."""
    from inventory.models import Stock

    try:
        product = Product.objects.get(id=product_id)
    except Product.DoesNotExist:
        return {"available": False, "quantity": 0, "status": "NOT_FOUND"}

    try:
        stock = Stock.objects.filter(product=product).aggregate(
            total_quantity=Sum("quantity")
        )
        quantity = stock.get("total_quantity") or 0
        return {
            "available": quantity > 0,
            "quantity": quantity,
            "status": "IN_STOCK" if quantity > 0 else "OUT_OF_STOCK",
            "product_id": product.id,
            "product_name": product.name,
        }
    except Exception:
        return {
            "available": False,
            "quantity": 0,
            "status": "UNKNOWN",
            "product_id": product.id,
            "product_name": product.name,
        }


def get_product_pricing_info(product_id: int) -> dict:
    """Get pricing information for RENT/LEASE requests."""
    try:
        product = Product.objects.get(id=product_id)
    except Product.DoesNotExist:
        return {"found": False, "error": "Product not found"}

    monthly_rent = getattr(product, "rental_monthly_price", product.base_price / 12)
    monthly_lease = getattr(product, "lease_monthly_price", product.base_price / 24)

    return {
        "found": True,
        "product_id": product.id,
        "product_name": product.name,
        "base_price": str(product.base_price),
        "monthly_rent_default": str(monthly_rent),
        "monthly_lease_default": str(monthly_lease),
    }


def validate_product_request_step(
    *,
    request_id: int,
    request_type: str,
    step: str,
) -> dict:
    """Validate that a request is ready for a specific workflow step."""
    req = ProductRequest.objects.select_related("customer", "batch").get(id=request_id)

    if step == "link_customer":
        return {"valid": False, "message": "Customer already linked"} if req.customer_id else {"valid": True}

    if step == "select_batch" and request_type == ProductRequestType.ADVANCE_EMI:
        return {"valid": bool(req.batch_id), "message": "Batch must be selected for EMI requests"}

    if step == "review":
        if not req.customer_id:
            return {"valid": False, "message": "Customer must be linked first"}
        if request_type == ProductRequestType.ADVANCE_EMI and not req.batch_id:
            return {"valid": False, "message": "Batch must be selected"}
        return {"valid": True}

    if step == "approve":
        if req.status != ProductRequestStatus.SUBMITTED:
            return {"valid": False, "message": "Only submitted requests can be approved"}
        return {"valid": True}

    return {"valid": False, "message": f"Unknown step: {step}"}
