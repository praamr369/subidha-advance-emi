from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import get_random_string
from django.utils.text import slugify

from accounts.models import User, UserRole
from subscriptions.models import (
    AuditLog,
    Batch,
    BatchStatus,
    Customer,
    LuckyId,
    LuckyIdStatus,
    Product,
    SubscriptionRequest,
    SubscriptionRequestStatus,
)
from subscriptions.services.audit_service import log_audit
from subscriptions.services.customer_account_service import sync_customer_login_identity
from subscriptions.services.subscription_service import create_emi_subscription


def subscription_request_base_queryset():
    return SubscriptionRequest.objects.select_related(
        "requester",
        "partner",
        "customer",
        "customer__user",
        "product",
        "batch",
        "reviewed_by",
        "approved_subscription",
    ).order_by("-created_at", "-id")


def subscription_request_lock_queryset():
    return SubscriptionRequest.objects.select_related(
        "requester",
        "partner",
        "customer",
        "customer__user",
        "product",
        "batch",
    )


def requestable_product_queryset():
    return Product.objects.filter(
        is_active=True,
        is_emi_enabled=True,
    ).order_by("name", "id")


def requestable_batch_queryset():
    return Batch.objects.filter(status=BatchStatus.OPEN).order_by(
        "start_date",
        "batch_code",
        "id",
    )


def available_lucky_numbers_for_batch(batch: Batch) -> list[int]:
    return list(
        LuckyId.objects.filter(
            batch=batch,
            status=LuckyIdStatus.AVAILABLE,
        )
        .order_by("lucky_number")
        .values_list("lucky_number", flat=True)
    )


def _validate_requestable_entities(
    *,
    product: Product,
    batch: Batch,
    preferred_lucky_number: int,
):
    errors = {}

    if not product.is_active or not product.is_emi_enabled:
        errors["product_id"] = "Selected product is not open for EMI subscription requests."

    if batch.status != BatchStatus.OPEN:
        errors["batch_id"] = "Selected batch is not open for subscription requests."

    lucky = LuckyId.objects.filter(
        batch=batch,
        lucky_number=preferred_lucky_number,
    ).first()
    if lucky is None:
        errors["preferred_lucky_number"] = "Preferred lucky number is not valid for the selected batch."
    elif lucky.status != LuckyIdStatus.AVAILABLE:
        errors["preferred_lucky_number"] = "Preferred lucky number is not currently available."

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


def _audit_request_created(request_obj: SubscriptionRequest, *, performed_by):
    log_audit(
        action_type=AuditLog.ActionType.SUBSCRIPTION_REQUEST_CREATED,
        instance=request_obj,
        performed_by=performed_by,
        metadata={
            "status": request_obj.status,
            "requester_role_snapshot": request_obj.requester_role_snapshot,
            "customer_id": request_obj.customer_id,
            "partner_id": request_obj.partner_id,
            "product_id": request_obj.product_id,
            "batch_id": request_obj.batch_id,
            "preferred_lucky_number": request_obj.preferred_lucky_number,
        },
    )


def create_customer_subscription_request(
    *,
    customer: Customer,
    requester,
    product: Product,
    batch: Batch,
    preferred_lucky_number: int,
    notes: str = "",
) -> SubscriptionRequest:
    if customer.user_id != requester.id:
        raise ValidationError({"detail": "Customer request must use the authenticated customer profile."})

    _validate_requestable_entities(
        product=product,
        batch=batch,
        preferred_lucky_number=preferred_lucky_number,
    )

    request_obj = SubscriptionRequest.objects.create(
        requester=requester,
        requester_role_snapshot=UserRole.CUSTOMER,
        customer=customer,
        product=product,
        batch=batch,
        preferred_lucky_number=preferred_lucky_number,
        requested_tenure_months_snapshot=batch.duration_months,
        notes=notes or "",
        status=SubscriptionRequestStatus.SUBMITTED,
        **_snapshot_customer_fields(customer),
    )
    _audit_request_created(request_obj, performed_by=requester)
    return request_obj


def create_partner_subscription_request(
    *,
    partner,
    product: Product,
    batch: Batch,
    preferred_lucky_number: int,
    notes: str = "",
    customer: Customer | None = None,
    requested_customer_name: str = "",
    requested_customer_phone: str = "",
    requested_customer_email: str = "",
    requested_customer_address: str = "",
    requested_customer_city: str = "",
) -> SubscriptionRequest:
    if getattr(partner, "role", None) != UserRole.PARTNER:
        raise ValidationError({"detail": "Only partner users can create partner subscription requests."})

    _validate_requestable_entities(
        product=product,
        batch=batch,
        preferred_lucky_number=preferred_lucky_number,
    )

    payload = {
        "requester": partner,
        "requester_role_snapshot": UserRole.PARTNER,
        "partner": partner,
        "customer": customer,
        "product": product,
        "batch": batch,
        "preferred_lucky_number": preferred_lucky_number,
        "requested_tenure_months_snapshot": batch.duration_months,
        "notes": notes or "",
        "status": SubscriptionRequestStatus.SUBMITTED,
    }

    if customer is not None:
        if not customer.subscriptions.filter(partner=partner).exists():
            raise ValidationError({"customer_id": "Existing customer is not visible to this partner."})
        payload.update(_snapshot_customer_fields(customer))
    else:
        payload.update(
            {
                "requested_customer_name": requested_customer_name,
                "requested_customer_phone": requested_customer_phone,
                "requested_customer_email": requested_customer_email,
                "requested_customer_address": requested_customer_address,
                "requested_customer_city": requested_customer_city,
            }
        )

    request_obj = SubscriptionRequest.objects.create(**payload)
    _audit_request_created(request_obj, performed_by=partner)
    return request_obj


def _base_username_from_name(name: str) -> str:
    normalized = slugify((name or "").strip())
    base = normalized.replace("-", "")[:16]
    return base or "customer"


def _next_available_username(base: str) -> str:
    candidate = base
    counter = 1

    while User.objects.filter(username=candidate).exists():
        counter += 1
        suffix = str(counter)
        candidate = f"{base[: max(1, 16 - len(suffix))]}{suffix}"

    return candidate


def _create_customer_from_request_snapshot(
    request_obj: SubscriptionRequest,
    *,
    performed_by,
) -> Customer:
    name = (request_obj.requested_customer_name or "").strip()
    phone = (request_obj.requested_customer_phone or "").strip()
    email = (request_obj.requested_customer_email or "").strip()
    address = (request_obj.requested_customer_address or "").strip()
    city = (request_obj.requested_customer_city or "").strip()

    errors = {}
    if not name:
        errors["requested_customer_name"] = "Customer name is required to create a customer."
    if not phone:
        errors["requested_customer_phone"] = "Customer phone is required to create a customer."
    if not email:
        errors["requested_customer_email"] = "Customer email is required to create a customer."

    if email and User.objects.filter(email__iexact=email).exists():
        errors["requested_customer_email"] = "A user with this email already exists. Link the existing customer instead."
    if phone and User.objects.filter(phone=phone).exists():
        errors["requested_customer_phone"] = "A user with this phone already exists. Link the existing customer instead."

    if errors:
        raise ValidationError(errors)

    username = _next_available_username(_base_username_from_name(name))
    generated_password = get_random_string(24)

    user = User.objects.create_user(
        username=username,
        password=generated_password,
        role=UserRole.CUSTOMER,
        phone=phone,
        email=email,
        first_name=name,
    )
    customer = Customer.objects.create(
        user=user,
        name=name,
        phone=phone,
        address=address,
        city=city,
    )
    sync_customer_login_identity(
        customer,
        name=name,
        phone=phone,
        email=email,
        address=address,
        city=city,
    )
    log_audit(
        action_type=AuditLog.ActionType.USER_CREATED,
        instance=customer,
        performed_by=performed_by,
        metadata={
            "origin": "SUBSCRIPTION_REQUEST_APPROVAL",
            "user_id": user.id,
            "username": user.username,
        },
    )
    return customer


def cancel_subscription_request(
    *,
    request_obj: SubscriptionRequest,
    performed_by,
) -> SubscriptionRequest:
    if request_obj.status == SubscriptionRequestStatus.CANCELLED:
        raise ValueError("Subscription request is already cancelled.")
    if request_obj.status == SubscriptionRequestStatus.APPROVED:
        raise ValueError("Approved request cannot be cancelled.")
    if request_obj.status == SubscriptionRequestStatus.REJECTED:
        raise ValueError("Rejected request cannot be cancelled.")

    request_obj.status = SubscriptionRequestStatus.CANCELLED
    request_obj.save(update_fields=["status", "updated_at"])
    log_audit(
        action_type=AuditLog.ActionType.SUBSCRIPTION_REQUEST_CANCELLED,
        instance=request_obj,
        performed_by=performed_by,
        metadata={
            "status": request_obj.status,
        },
    )
    return request_obj


@transaction.atomic
def approve_subscription_request(
    *,
    request_obj: SubscriptionRequest,
    performed_by,
    customer: Customer | None = None,
    create_customer: bool = False,
    lucky_number_override: int | None = None,
    review_note: str = "",
) -> SubscriptionRequest:
    if request_obj.status == SubscriptionRequestStatus.APPROVED:
        raise ValueError("Subscription request is already approved.")
    if request_obj.status == SubscriptionRequestStatus.REJECTED:
        raise ValueError("Rejected request cannot be approved.")
    if request_obj.status == SubscriptionRequestStatus.CANCELLED:
        raise ValueError("Cancelled request cannot be approved.")

    if request_obj.customer_id:
        if customer is not None and customer.id != request_obj.customer_id:
            raise ValidationError({"customer_id": "Request is already linked to a different customer."})
        if create_customer:
            raise ValidationError({"create_customer": "Request already links a customer."})
        resolved_customer = request_obj.customer
    else:
        if bool(customer) == bool(create_customer):
            raise ValidationError(
                {
                    "detail": "Provide exactly one of customer_id or create_customer when the request has no linked customer."
                }
            )
        resolved_customer = (
            customer
            if customer is not None
            else _create_customer_from_request_snapshot(
                request_obj,
                performed_by=performed_by,
            )
        )

    product = request_obj.product
    batch = Batch.objects.select_for_update().get(pk=request_obj.batch_id)

    if not product.is_active or not product.is_emi_enabled:
        raise ValidationError({"detail": "Requested product is no longer available for EMI subscription approval."})
    if batch.status != BatchStatus.OPEN:
        raise ValidationError({"detail": "Requested batch is no longer open for approval."})

    lucky_number = (
        lucky_number_override
        if lucky_number_override is not None
        else request_obj.preferred_lucky_number
    )

    lucky = LuckyId.objects.select_for_update().filter(
        batch=batch,
        lucky_number=lucky_number,
    ).first()
    if lucky is None:
        raise ValidationError({"lucky_number_override": "Selected lucky number does not exist in the selected batch."})
    if lucky.status != LuckyIdStatus.AVAILABLE:
        field_name = "lucky_number_override" if lucky_number_override is not None else "preferred_lucky_number"
        raise ValidationError(
            {
                field_name: "Selected lucky number is no longer available. Supply an available override to approve this request."
            }
        )

    subscription = create_emi_subscription(
        customer=resolved_customer,
        product=product,
        batch=batch,
        lucky_number=lucky_number,
        tenure_months=batch.duration_months,
        partner=request_obj.partner,
        performed_by=performed_by,
    )

    request_obj.customer = resolved_customer
    request_obj.status = SubscriptionRequestStatus.APPROVED
    request_obj.reviewed_by = performed_by
    request_obj.reviewed_at = timezone.now()
    request_obj.review_note = review_note or ""
    request_obj.approved_subscription = subscription
    request_obj.save(
        update_fields=[
            "customer",
            "status",
            "reviewed_by",
            "reviewed_at",
            "review_note",
            "approved_subscription",
            "updated_at",
        ]
    )
    log_audit(
        action_type=AuditLog.ActionType.SUBSCRIPTION_REQUEST_APPROVED,
        instance=request_obj,
        performed_by=performed_by,
        metadata={
            "approved_subscription_id": subscription.id,
            "customer_id": resolved_customer.id,
            "product_id": product.id,
            "batch_id": batch.id,
            "preferred_lucky_number": request_obj.preferred_lucky_number,
            "approved_lucky_number": lucky_number,
            "used_override": lucky_number_override is not None,
        },
    )
    return request_obj


@transaction.atomic
def reject_subscription_request(
    *,
    request_obj: SubscriptionRequest,
    performed_by,
    review_note: str = "",
) -> SubscriptionRequest:
    if request_obj.status == SubscriptionRequestStatus.APPROVED:
        raise ValueError("Approved request cannot be rejected.")
    if request_obj.status == SubscriptionRequestStatus.REJECTED:
        raise ValueError("Subscription request is already rejected.")
    if request_obj.status == SubscriptionRequestStatus.CANCELLED:
        raise ValueError("Cancelled request cannot be rejected.")

    request_obj.status = SubscriptionRequestStatus.REJECTED
    request_obj.reviewed_by = performed_by
    request_obj.reviewed_at = timezone.now()
    request_obj.review_note = review_note or ""
    request_obj.save(
        update_fields=[
            "status",
            "reviewed_by",
            "reviewed_at",
            "review_note",
            "updated_at",
        ]
    )
    log_audit(
        action_type=AuditLog.ActionType.SUBSCRIPTION_REQUEST_REJECTED,
        instance=request_obj,
        performed_by=performed_by,
        metadata={
            "customer_id": request_obj.customer_id,
            "partner_id": request_obj.partner_id,
            "product_id": request_obj.product_id,
            "batch_id": request_obj.batch_id,
        },
    )
    return request_obj
