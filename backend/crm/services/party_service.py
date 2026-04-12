from __future__ import annotations

from typing import Iterable

from django.db import transaction

from accounts.models import User, UserRole
from accounting.models import EmployeeProfile, Vendor
from crm.models import PartyKind, PartyLink, PartyLinkRole, PartyMaster
from subscriptions.models import AuditLog, Customer, PublicLead
from subscriptions.services.audit_service import log_audit


PEOPLE_ROLES = {
    PartyLinkRole.LEAD,
    PartyLinkRole.CUSTOMER,
    PartyLinkRole.PARTNER,
    PartyLinkRole.STAFF,
}


def _normalize_phone(value: str | None) -> str:
    return (value or "").strip()


def _normalize_email(value: str | None) -> str:
    return (value or "").strip().lower()


def _display_name_from_user(user: User) -> str:
    full_name = f"{user.first_name or ''} {user.last_name or ''}".strip()
    return full_name or user.username


def _guess_party_kind(role_type: str) -> str:
    if role_type == PartyLinkRole.VENDOR:
        return PartyKind.ORGANIZATION
    return PartyKind.PERSON


def _source_filter(*, role_type: str, app_label: str, model: str, source_pk: int):
    return {
        "role_type": role_type,
        "source_app_label": app_label,
        "source_model": model,
        "source_pk": source_pk,
    }


def _find_candidate_party(*, role_type: str, phone: str, email: str) -> PartyMaster | None:
    queryset = PartyMaster.objects.all()
    if role_type in PEOPLE_ROLES:
        if phone:
            return queryset.filter(primary_phone=phone).order_by("id").first()
        if email:
            return queryset.filter(primary_email__iexact=email).order_by("id").first()
        return None

    if email:
        return (
            queryset.filter(primary_email__iexact=email, links__role_type=PartyLinkRole.VENDOR)
            .distinct()
            .order_by("id")
            .first()
        )
    return None


def _update_party_snapshot(
    *,
    party: PartyMaster,
    display_name: str,
    party_kind: str,
    phone: str,
    email: str,
    city: str,
    is_active: bool,
):
    update_fields: list[str] = []
    next_display_name = (display_name or "").strip()
    if next_display_name and (not party.display_name or party.display_name != next_display_name):
        party.display_name = next_display_name
        update_fields.append("display_name")
    if party.party_kind != party_kind:
        party.party_kind = party_kind
        update_fields.append("party_kind")
    if phone and party.primary_phone != phone:
        party.primary_phone = phone
        update_fields.append("primary_phone")
    if email and party.primary_email != email:
        party.primary_email = email
        update_fields.append("primary_email")
    if city and party.city != city:
        party.city = city
        update_fields.append("city")
    if party.is_active != is_active:
        party.is_active = is_active
        update_fields.append("is_active")
    if update_fields:
        party.save(update_fields=[*update_fields, "updated_at"])


def _create_party(
    *,
    role_type: str,
    display_name: str,
    phone: str,
    email: str,
    city: str,
    is_active: bool,
    performed_by=None,
) -> PartyMaster:
    party = PartyMaster.objects.create(
        display_name=(display_name or "").strip(),
        party_kind=_guess_party_kind(role_type),
        primary_phone=phone,
        primary_email=email,
        city=(city or "").strip(),
        is_active=is_active,
    )
    log_audit(
        action_type=AuditLog.ActionType.CRM_PARTY_CREATED,
        instance=party,
        performed_by=performed_by,
        metadata={
            "event": "CRM_PARTY_CREATED",
            "role_type": role_type,
            "party_no": party.party_no,
        },
    )
    return party


def _ensure_link(
    *,
    party: PartyMaster,
    role_type: str,
    app_label: str,
    model: str,
    source_pk: int,
    source_reference: str,
    metadata: dict | None,
    performed_by=None,
) -> PartyLink:
    link = PartyLink.objects.filter(**_source_filter(
        role_type=role_type,
        app_label=app_label,
        model=model,
        source_pk=source_pk,
    )).first()
    created = False
    if link is None:
        link = PartyLink.objects.create(
            party=party,
            role_type=role_type,
            source_app_label=app_label,
            source_model=model,
            source_pk=source_pk,
            source_reference=(source_reference or "").strip(),
            is_primary=True,
            metadata=metadata or {},
        )
        created = True
    else:
        update_fields: list[str] = []
        if link.party_id != party.id:
            link.party = party
            update_fields.append("party")
        normalized_reference = (source_reference or "").strip()
        if link.source_reference != normalized_reference:
            link.source_reference = normalized_reference
            update_fields.append("source_reference")
        next_metadata = metadata or {}
        if link.metadata != next_metadata:
            link.metadata = next_metadata
            update_fields.append("metadata")
        if not link.is_primary:
            link.is_primary = True
            update_fields.append("is_primary")
        if update_fields:
            link.save(update_fields=[*update_fields, "updated_at"])

    if created:
        log_audit(
            action_type=AuditLog.ActionType.CRM_PARTY_LINKED,
            instance=link,
            performed_by=performed_by,
            metadata={
                "event": "CRM_PARTY_LINKED",
                "party_id": party.id,
                "role_type": role_type,
                "source_model": model,
                "source_pk": source_pk,
            },
        )
    return link


def _sync_party(
    *,
    role_type: str,
    app_label: str,
    model: str,
    source_pk: int,
    display_name: str,
    phone: str = "",
    email: str = "",
    city: str = "",
    is_active: bool = True,
    source_reference: str = "",
    metadata: dict | None = None,
    party: PartyMaster | None = None,
    performed_by=None,
) -> PartyMaster:
    normalized_phone = _normalize_phone(phone)
    normalized_email = _normalize_email(email)
    normalized_city = (city or "").strip()
    with transaction.atomic():
        link = PartyLink.objects.select_related("party").filter(
            **_source_filter(
                role_type=role_type,
                app_label=app_label,
                model=model,
                source_pk=source_pk,
            )
        ).first()
        if link and party is None:
            party = link.party
        if party is None:
            party = _find_candidate_party(
                role_type=role_type,
                phone=normalized_phone,
                email=normalized_email,
            )
        if party is None:
            party = _create_party(
                role_type=role_type,
                display_name=display_name,
                phone=normalized_phone,
                email=normalized_email,
                city=normalized_city,
                is_active=is_active,
                performed_by=performed_by,
            )
        _update_party_snapshot(
            party=party,
            display_name=display_name,
            party_kind=_guess_party_kind(role_type),
            phone=normalized_phone,
            email=normalized_email,
            city=normalized_city,
            is_active=is_active,
        )
        _ensure_link(
            party=party,
            role_type=role_type,
            app_label=app_label,
            model=model,
            source_pk=source_pk,
            source_reference=source_reference,
            metadata=metadata,
            performed_by=performed_by,
        )
        return party


def sync_party_for_lead(lead: PublicLead, *, party: PartyMaster | None = None, performed_by=None) -> PartyMaster:
    return _sync_party(
        role_type=PartyLinkRole.LEAD,
        app_label="subscriptions",
        model="PublicLead",
        source_pk=lead.id,
        display_name=lead.name,
        phone=lead.phone,
        city=lead.city,
        is_active=lead.status != "CLOSED",
        source_reference=f"LEAD-{lead.id}",
        metadata={
            "status": lead.status,
            "product_id": lead.product_id,
            "source": lead.source,
        },
        party=party,
        performed_by=performed_by,
    )


def sync_party_for_customer(customer: Customer, *, party: PartyMaster | None = None, performed_by=None) -> PartyMaster:
    user = getattr(customer, "user", None)
    return _sync_party(
        role_type=PartyLinkRole.CUSTOMER,
        app_label="subscriptions",
        model="Customer",
        source_pk=customer.id,
        display_name=customer.name,
        phone=customer.phone,
        email=getattr(user, "email", ""),
        city=customer.city,
        is_active=getattr(user, "is_active", True),
        source_reference=f"CUST-{customer.id}",
        metadata={
            "user_id": customer.user_id,
            "kyc_status": customer.kyc_status,
        },
        party=party,
        performed_by=performed_by,
    )


def sync_party_for_partner(partner_user: User, *, party: PartyMaster | None = None, performed_by=None) -> PartyMaster:
    return _sync_party(
        role_type=PartyLinkRole.PARTNER,
        app_label="accounts",
        model="User",
        source_pk=partner_user.id,
        display_name=_display_name_from_user(partner_user),
        phone=partner_user.phone,
        email=partner_user.email,
        is_active=partner_user.is_active,
        source_reference=f"PARTNER-{partner_user.id}",
        metadata={
            "username": partner_user.username,
            "role": partner_user.role,
            "commission_rate": str(partner_user.commission_rate),
        },
        party=party,
        performed_by=performed_by,
    )


def sync_party_for_vendor(vendor: Vendor, *, party: PartyMaster | None = None, performed_by=None) -> PartyMaster:
    return _sync_party(
        role_type=PartyLinkRole.VENDOR,
        app_label="accounting",
        model="Vendor",
        source_pk=vendor.id,
        display_name=vendor.name,
        phone=vendor.phone,
        email=vendor.email,
        is_active=vendor.is_active,
        source_reference=f"VENDOR-{vendor.id}",
        metadata={
            "gstin": vendor.gstin,
            "state_code": vendor.state_code,
            "state_name": vendor.state_name,
        },
        party=party,
        performed_by=performed_by,
    )


def sync_party_for_employee(employee: EmployeeProfile, *, party: PartyMaster | None = None, performed_by=None) -> PartyMaster:
    return _sync_party(
        role_type=PartyLinkRole.STAFF,
        app_label="accounting",
        model="EmployeeProfile",
        source_pk=employee.id,
        display_name=employee.name,
        phone=employee.phone,
        is_active=employee.is_active,
        source_reference=employee.employee_code,
        metadata={
            "employee_code": employee.employee_code,
            "designation": employee.designation,
            "department": employee.department,
        },
        party=party,
        performed_by=performed_by,
    )


def find_party_for_source(*, role_type: str, source_model: str, source_pk: int) -> PartyMaster | None:
    link = PartyLink.objects.select_related("party").filter(
        role_type=role_type,
        source_model=source_model,
        source_pk=source_pk,
    ).first()
    return link.party if link else None


def sync_all_party_master(*, performed_by=None) -> dict[str, int]:
    summary = {
        "leads": 0,
        "customers": 0,
        "partners": 0,
        "vendors": 0,
        "staff": 0,
    }
    for lead in PublicLead.objects.select_related("product").all():
        sync_party_for_lead(lead, performed_by=performed_by)
        summary["leads"] += 1
    for customer in Customer.objects.select_related("user").all():
        sync_party_for_customer(customer, performed_by=performed_by)
        summary["customers"] += 1
    for partner in User.objects.filter(role=UserRole.PARTNER):
        sync_party_for_partner(partner, performed_by=performed_by)
        summary["partners"] += 1
    for vendor in Vendor.objects.all():
        sync_party_for_vendor(vendor, performed_by=performed_by)
        summary["vendors"] += 1
    for employee in EmployeeProfile.objects.all():
        sync_party_for_employee(employee, performed_by=performed_by)
        summary["staff"] += 1
    return summary


def seed_missing_party_links(*, performed_by=None) -> dict[str, int]:
    summary = {
        "leads": 0,
        "customers": 0,
        "partners": 0,
        "vendors": 0,
        "staff": 0,
    }

    existing_lead_ids = set(
        PartyLink.objects.filter(
            role_type=PartyLinkRole.LEAD,
            source_model="PublicLead",
        ).values_list("source_pk", flat=True)
    )
    for lead in PublicLead.objects.select_related("product").exclude(id__in=existing_lead_ids):
        sync_party_for_lead(lead, performed_by=performed_by)
        summary["leads"] += 1

    existing_customer_ids = set(
        PartyLink.objects.filter(
            role_type=PartyLinkRole.CUSTOMER,
            source_model="Customer",
        ).values_list("source_pk", flat=True)
    )
    for customer in Customer.objects.select_related("user").exclude(id__in=existing_customer_ids):
        sync_party_for_customer(customer, performed_by=performed_by)
        summary["customers"] += 1

    existing_partner_ids = set(
        PartyLink.objects.filter(
            role_type=PartyLinkRole.PARTNER,
            source_model="User",
        ).values_list("source_pk", flat=True)
    )
    for partner in User.objects.filter(role=UserRole.PARTNER).exclude(id__in=existing_partner_ids):
        sync_party_for_partner(partner, performed_by=performed_by)
        summary["partners"] += 1

    existing_vendor_ids = set(
        PartyLink.objects.filter(
            role_type=PartyLinkRole.VENDOR,
            source_model="Vendor",
        ).values_list("source_pk", flat=True)
    )
    for vendor in Vendor.objects.exclude(id__in=existing_vendor_ids):
        sync_party_for_vendor(vendor, performed_by=performed_by)
        summary["vendors"] += 1

    existing_employee_ids = set(
        PartyLink.objects.filter(
            role_type=PartyLinkRole.STAFF,
            source_model="EmployeeProfile",
        ).values_list("source_pk", flat=True)
    )
    for employee in EmployeeProfile.objects.exclude(id__in=existing_employee_ids):
        sync_party_for_employee(employee, performed_by=performed_by)
        summary["staff"] += 1

    return summary


def summarize_role_types(links: Iterable[PartyLink]) -> list[str]:
    return sorted({link.role_type for link in links})
