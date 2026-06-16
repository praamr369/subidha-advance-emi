"""
CustomerService – Phase 1

Centralised business logic for customer creation, lookup, KYC, and referral.

Rules:
- All financial records (EMI/Payment/Waiver) are NEVER touched here.
- Email is OPTIONAL for quick-create (shop direct-sale flow).
- Phone is the primary deduplication key after normalisation.
- KYC update by customer NEVER auto-approves; admin must approve/reject.
- Referral commission is NEVER auto-payable; admin must enable/approve.
"""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Optional

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import get_random_string

from subscriptions.models import (
    AuditLog,
    BusinessEventType,
    Customer,
    CustomerKycDocument,
    CustomerKycDocumentStatus,
    CustomerReferral,
    CustomerSource,
    KycDocumentCategory,
    KycStatus,
)
from subscriptions.services.customer_account_service import (
    build_customer_profile_summary,
    build_customer_operational_profile,
)
from subscriptions.services.business_event_service import append_business_event

User = get_user_model()

# ---------------------------------------------------------------------------
# Phone Normalisation
# ---------------------------------------------------------------------------

_STRIP_NON_DIGITS = re.compile(r"[^\d+]")


def normalize_phone(raw: str) -> str:
    """
    Strips whitespace, dashes, parentheses from a phone string.
    Keeps the leading '+' for international numbers.
    Raises ValueError if the result is empty or too short.
    """
    if not raw or not raw.strip():
        raise ValueError("Phone number is required.")
    cleaned = _STRIP_NON_DIGITS.sub("", raw.strip())
    if len(cleaned) < 7:
        raise ValueError(f"Phone number '{raw}' is too short after normalisation.")
    return cleaned


# ---------------------------------------------------------------------------
# Partner Visibility Scoping
# ---------------------------------------------------------------------------

def get_partner_visible_customer_ids(partner_user) -> set:
    """
    Returns the set of Customer PKs that a partner user is authorised to see.

    A partner can see a customer if ANY of the following hold:
      1. The customer was directly created by this partner user.
      2. The customer has at least one Subscription linked to this partner.
      3. The customer has at least one SubscriptionRequest linked to this partner.

    This is intentionally additive: all three sources are unioned so no
    legitimate partner–customer link is silently excluded.
    """
    from subscriptions.models import Subscription, SubscriptionRequest  # avoid circular

    # Direct creation
    ids: set = set(
        Customer.objects.filter(created_by_partner_user=partner_user)
        .values_list("id", flat=True)
    )
    # Via subscriptions
    ids.update(
        Subscription.objects.filter(partner=partner_user)
        .values_list("customer_id", flat=True)
    )
    # Via subscription requests
    ids.update(
        SubscriptionRequest.objects.filter(partner=partner_user)
        .values_list("customer_id", flat=True)
    )
    return ids


# ---------------------------------------------------------------------------
# Customer Search
# ---------------------------------------------------------------------------

def search_customers(
    *,
    phone: Optional[str] = None,
    name: Optional[str] = None,
    email: Optional[str] = None,
    customer_code: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 20,
    partner_user=None,
):
    """
    Phone-first customer search.

    When ``partner_user`` is supplied the result set is restricted to customers
    visible to that partner (created by them or linked via subscription /
    subscription request).  Admin callers should pass ``partner_user=None``.

    Returns a queryset (caller is responsible for slicing/pagination).
    """
    from django.db.models import Q

    qs = Customer.objects.select_related("user").order_by("-created_at")

    # Partner scope: applied first so every subsequent filter stays within scope
    if partner_user is not None:
        visible_ids = get_partner_visible_customer_ids(partner_user)
        qs = qs.filter(id__in=visible_ids)

    # Exact phone match – highest priority (deduplication)
    if phone:
        try:
            norm = normalize_phone(phone)
        except ValueError:
            norm = phone.strip()
        exact_qs = qs.filter(phone=norm)
        if exact_qs.exists():
            return exact_qs[:limit]
        # Fall back to partial phone match
        qs = qs.filter(phone__icontains=norm)
        return qs[:limit]

    # Generic search term
    if q:
        term = q.strip()
        tokenized_filter = None
        tokens = [token.strip() for token in term.split() if token.strip()]
        if tokens:
            for token in tokens:
                token_digits = re.sub(r"\D", "", token)
                per_token = (
                    Q(name__icontains=token)
                    | Q(user__email__icontains=token)
                    | Q(customer_code__icontains=token)
                    | Q(direct_sales__customer_gstin__icontains=token.upper())
                    | Q(billing_invoices__customer_gstin__icontains=token.upper())
                )
                if token_digits:
                    per_token = (
                        per_token
                        | Q(phone__icontains=token_digits)
                        | Q(phone__icontains=token)
                    )
                    if token_digits.isdigit():
                        per_token = per_token | Q(id=int(token_digits))
                elif token.isdigit():
                    per_token = per_token | Q(id=int(token))
                tokenized_filter = per_token if tokenized_filter is None else (tokenized_filter & per_token)
        full_term_filter = (
            Q(name__icontains=term)
            | Q(phone__icontains=term)
            | Q(user__email__icontains=term)
            | Q(customer_code__icontains=term)
            | Q(direct_sales__customer_gstin__icontains=term.upper())
            | Q(billing_invoices__customer_gstin__icontains=term.upper())
        )
        if term.isdigit():
            full_term_filter = full_term_filter | Q(id=int(term))
        combined_filter = full_term_filter | tokenized_filter if tokenized_filter is not None else full_term_filter
        qs = qs.filter(combined_filter).distinct()
        return qs[:limit]

    if name:
        qs = qs.filter(name__icontains=name.strip())
    if email:
        qs = qs.filter(user__email__icontains=email.strip())
    if customer_code:
        qs = qs.filter(customer_code__icontains=customer_code.strip())

    return qs[:limit]


# ---------------------------------------------------------------------------
# Find-or-Create (deduplication gate)
# ---------------------------------------------------------------------------

def find_customer_by_phone(phone: str) -> Optional[Customer]:
    """Returns the first Customer whose phone matches the normalised phone."""
    try:
        norm = normalize_phone(phone)
    except ValueError:
        return None
    return Customer.objects.filter(phone=norm).first()


@transaction.atomic
def find_or_create_customer(
    *,
    name: str,
    phone: str,
    email: str = "",
    address: str = "",
    city: str = "",
    source: str = CustomerSource.ADMIN,
    created_by=None,
    created_by_partner=None,
) -> tuple[Customer, bool]:
    """
    Returns (customer, created).
    If a customer with this phone already exists, returns the existing one (created=False).
    Email is OPTIONAL.  When absent, a username is derived from the phone.
    """
    norm_phone = normalize_phone(phone)
    existing = Customer.objects.filter(phone=norm_phone).first()
    if existing is not None:
        return existing, False

    norm_name = (name or "").strip()
    if not norm_name:
        raise ValueError("Customer name is required.")

    norm_email = (email or "").strip().lower()

    # Derive a safe username
    username = _derive_username(norm_phone, norm_name)

    user = User.objects.create_user(
        username=username,
        password=get_random_string(16),
        role="CUSTOMER",
        phone=norm_phone,
        email=norm_email,
        first_name=norm_name,
    )

    customer_code = _generate_customer_code(norm_name, norm_phone)

    customer = Customer.objects.create(
        user=user,
        name=norm_name,
        phone=norm_phone,
        address=(address or "").strip(),
        city=(city or "").strip(),
        customer_source=source,
        created_by_user=created_by,
        created_by_partner_user=created_by_partner if _is_partner(created_by_partner) else None,
        customer_code=customer_code,
    )

    AuditLog.objects.create(
        action_type=AuditLog.ActionType.CUSTOMER_CREATED,
        model_name="Customer",
        object_id=customer.pk,
        performed_by=created_by,
        metadata={
            "source": source,
            "phone": norm_phone,
            "has_email": bool(norm_email),
        },
    )
    append_business_event(
        event_type=BusinessEventType.CUSTOMER_CREATED,
        source_module="subscriptions.services.customer_service.find_or_create_customer",
        actor_user=created_by,
        customer=customer,
        payload={
            "source": source,
            "phone": norm_phone,
            "has_email": bool(norm_email),
        },
    )
    return customer, True


# ---------------------------------------------------------------------------
# Contact Update (email audit)
# ---------------------------------------------------------------------------

@transaction.atomic
def update_customer_contact(
    customer: Customer,
    *,
    name: Optional[str] = None,
    phone: Optional[str] = None,
    email: Optional[str] = None,
    address: Optional[str] = None,
    city: Optional[str] = None,
    performed_by=None,
) -> Customer:
    """
    Update customer contact fields.  Tracks email add/change in AuditLog.
    Does NOT touch any financial records.
    """
    old_email = (getattr(customer.user, "email", "") or "").strip().lower()

    updated_fields: list[str] = []
    meta: dict = {}

    if name is not None:
        n = name.strip()
        if n and n != customer.name:
            customer.name = n
            customer.user.first_name = n
            updated_fields.append("name")

    if phone is not None:
        try:
            np = normalize_phone(phone)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc
        if np != customer.phone:
            # Check uniqueness
            if Customer.objects.filter(phone=np).exclude(pk=customer.pk).exists():
                raise ValueError("Another customer already has this phone number.")
            customer.phone = np
            customer.user.phone = np
            updated_fields.append("phone")

    if email is not None:
        new_email = email.strip().lower()
        if new_email != old_email:
            if new_email and User.objects.filter(email__iexact=new_email).exclude(pk=customer.user_id).exists():
                raise ValueError("Email already in use by another account.")
            customer.user.email = new_email
            if old_email == "":
                meta["email_action"] = "ADDED"
                action_type = AuditLog.ActionType.CUSTOMER_EMAIL_ADDED
            else:
                meta["email_action"] = "CHANGED"
                meta["old_email"] = old_email
                action_type = AuditLog.ActionType.CUSTOMER_EMAIL_CHANGED
            updated_fields.append("email")
        else:
            action_type = AuditLog.ActionType.USER_UPDATED

    if address is not None:
        customer.address = address.strip()
        updated_fields.append("address")

    if city is not None:
        customer.city = city.strip()
        updated_fields.append("city")

    if updated_fields:
        customer.user.save()
        customer.save()

        AuditLog.objects.create(
            action_type=AuditLog.ActionType.USER_UPDATED,
            model_name="Customer",
            object_id=customer.pk,
            performed_by=performed_by,
            metadata={"updated_fields": updated_fields, **meta},
        )

    return customer


# ---------------------------------------------------------------------------
# KYC
# ---------------------------------------------------------------------------

@transaction.atomic
def create_kyc_update_request(
    customer: Customer,
    *,
    document_type: str,
    file,
    notes: str = "",
    uploaded_by=None,
    category: str = "",
) -> CustomerKycDocument:
    """
    Customer-initiated KYC document submission.
    Status is set to SUBMITTED (never auto-approved).
    Customer KYC status on the profile is updated to SUBMITTED.
    """
    doc = CustomerKycDocument.objects.create(
        customer=customer,
        document_type=document_type,
        category=(category or "").strip() or KycDocumentCategory.UNSPECIFIED,
        file=file,
        original_filename=(getattr(file, "name", "") or "")[:255],
        content_type=(getattr(file, "content_type", "") or "")[:100],
        file_size=int(getattr(file, "size", 0) or 0),
        notes=(notes or "").strip(),
        status=CustomerKycDocumentStatus.SUBMITTED,
        uploaded_by=uploaded_by,
    )

    if customer.kyc_status not in (
        KycStatus.APPROVED,
        KycStatus.VERIFIED,
        KycStatus.EXCEPTION_APPROVED,
    ):
        customer.kyc_status = KycStatus.SUBMITTED
        customer.save(update_fields=["kyc_status"])

    AuditLog.objects.create(
        action_type=AuditLog.ActionType.CUSTOMER_KYC_DOCUMENT_SUBMITTED,
        model_name="CustomerKycDocument",
        object_id=doc.pk,
        performed_by=uploaded_by,
        metadata={
            "customer_id": customer.pk,
            "document_type": document_type,
        },
    )
    return doc


@transaction.atomic
def approve_kyc(
    customer: Customer,
    *,
    performed_by=None,
    document_id: Optional[int] = None,
) -> Customer:
    """
    Admin-only: approve customer KYC.
    Optionally marks a specific KycDocument as approved.
    """
    old_status = customer.kyc_status
    customer.kyc_status = KycStatus.APPROVED
    customer.kyc_reviewed_by = performed_by
    customer.kyc_reviewed_at = timezone.now()
    customer.kyc_rejection_reason = ""
    customer.save(update_fields=["kyc_status", "kyc_reviewed_by", "kyc_reviewed_at", "kyc_rejection_reason"])

    if document_id:
        CustomerKycDocument.objects.filter(
            customer=customer, pk=document_id
        ).update(
            status=CustomerKycDocumentStatus.APPROVED,
            reviewed_by=performed_by,
            reviewed_at=timezone.now(),
        )

    AuditLog.objects.create(
        action_type=AuditLog.ActionType.CUSTOMER_KYC_APPROVED,
        model_name="Customer",
        object_id=customer.pk,
        performed_by=performed_by,
        metadata={"old_status": old_status, "new_status": KycStatus.APPROVED},
    )
    return customer


@transaction.atomic
def reject_kyc(
    customer: Customer,
    *,
    reason: str = "",
    performed_by=None,
    document_id: Optional[int] = None,
) -> Customer:
    """
    Admin-only: reject customer KYC.
    """
    old_status = customer.kyc_status
    customer.kyc_status = KycStatus.REJECTED
    customer.kyc_reviewed_by = performed_by
    customer.kyc_reviewed_at = timezone.now()
    customer.kyc_rejection_reason = (reason or "").strip()
    customer.save(update_fields=["kyc_status", "kyc_reviewed_by", "kyc_reviewed_at", "kyc_rejection_reason"])

    if document_id:
        CustomerKycDocument.objects.filter(
            customer=customer, pk=document_id
        ).update(
            status=CustomerKycDocumentStatus.REJECTED,
            rejection_reason=(reason or "").strip(),
            reviewed_by=performed_by,
            reviewed_at=timezone.now(),
        )

    AuditLog.objects.create(
        action_type=AuditLog.ActionType.CUSTOMER_KYC_REJECTED,
        model_name="Customer",
        object_id=customer.pk,
        performed_by=performed_by,
        metadata={
            "old_status": old_status,
            "new_status": KycStatus.REJECTED,
            "reason": customer.kyc_rejection_reason,
        },
    )
    return customer


@transaction.atomic
def exception_approve_kyc(
    customer: Customer,
    *,
    reason: str,
    performed_by=None,
) -> Customer:
    """
    Admin-only: record an explicit, audited KYC exception override.

    This is the safe alternative to silently bypassing the KYC gate: it sets
    ``kyc_status = EXCEPTION_APPROVED`` (which the contract readiness gate
    accepts) but only with a mandatory reason and a recorded actor + timestamp.
    It never auto-verifies documents and never fabricates verification state.
    """
    normalized_reason = (reason or "").strip()
    if not normalized_reason:
        raise ValidationError({"reason": "An exception-approval reason is required."})
    if performed_by is None:
        raise ValidationError({"performed_by": "An acting admin is required."})

    old_status = customer.kyc_status
    customer.kyc_status = KycStatus.EXCEPTION_APPROVED
    customer.kyc_reviewed_by = performed_by
    customer.kyc_reviewed_at = timezone.now()
    customer.kyc_rejection_reason = ""
    customer.save(
        update_fields=[
            "kyc_status",
            "kyc_reviewed_by",
            "kyc_reviewed_at",
            "kyc_rejection_reason",
        ]
    )

    AuditLog.objects.create(
        action_type=AuditLog.ActionType.CUSTOMER_KYC_EXCEPTION_APPROVED,
        model_name="Customer",
        object_id=customer.pk,
        performed_by=performed_by,
        metadata={
            "old_status": old_status,
            "new_status": KycStatus.EXCEPTION_APPROVED,
            "reason": normalized_reason,
        },
    )
    return customer


# ---------------------------------------------------------------------------
# Profile Summary
# ---------------------------------------------------------------------------

def get_customer_profile_summary(customer: Customer) -> dict:
    """Delegates to existing service – Phase 1 just exposes it here."""
    return build_customer_profile_summary(customer)


def get_customer_operational_profile(customer: Customer) -> dict:
    """Full operational profile with direct sales, invoices, payments, etc."""
    return build_customer_operational_profile(customer)


# ---------------------------------------------------------------------------
# Referral
# ---------------------------------------------------------------------------

@transaction.atomic
def create_referral(
    referrer: Customer,
    referred: Customer,
    *,
    created_by=None,
    notes: str = "",
) -> CustomerReferral:
    """
    Create a referral relationship.  Commission is NOT auto-enabled.
    Raises ValueError if the pair already exists or is self-referential.
    """
    if referrer.pk == referred.pk:
        raise ValueError("A customer cannot refer themselves.")
    if CustomerReferral.objects.filter(referrer=referrer, referred=referred).exists():
        raise ValueError("This referral relationship already exists.")

    referral = CustomerReferral.objects.create(
        referrer=referrer,
        referred=referred,
        created_by=created_by,
        notes=(notes or "").strip(),
        commission_enabled=False,
        commission_amount=Decimal("0.00"),
        commission_approved=False,
    )

    AuditLog.objects.create(
        action_type=AuditLog.ActionType.CUSTOMER_REFERRAL_CREATED,
        model_name="CustomerReferral",
        object_id=referral.pk,
        performed_by=created_by,
        metadata={
            "referrer_id": referrer.pk,
            "referred_id": referred.pk,
        },
    )
    return referral


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _derive_username(phone: str, name: str) -> str:
    """
    Derive a unique username from phone and name.
    Format: cust_<last8digits_of_phone>  (with counter if collision)
    """
    from django.utils.text import slugify

    base = f"cust_{phone[-8:]}"
    if not User.objects.filter(username=base).exists():
        return base
    # Try name-based
    slug = slugify(name.split()[0] if name.split() else "customer")[:10]
    base2 = f"cust_{slug}_{phone[-6:]}"
    if not User.objects.filter(username=base2).exists():
        return base2
    # Counter fallback
    for i in range(1, 1000):
        candidate = f"{base}_{i}"
        if not User.objects.filter(username=candidate).exists():
            return candidate
    return f"cust_{get_random_string(10)}"


def _generate_customer_code(name: str, phone: str) -> str:
    from django.utils.text import slugify

    prefix = slugify(name.split()[0] if name.split() else "cust")[:4].upper()
    suffix = phone[-4:]
    token = get_random_string(4).upper()
    return f"C-{prefix}{suffix}-{token}"


def _is_partner(user) -> bool:
    if user is None:
        return False
    return getattr(user, "role", "") == "PARTNER"
