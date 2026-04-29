from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Q, Sum
from django.utils import timezone

from branch_control.services.branch_service import assigned_branch_ids_for_user
from subscriptions.models import (
    ContractReference,
    ContractReferenceSequence,
    ContractReferenceType,
    EmiStatus,
    MONEY_ZERO,
    PlanType,
    RentLeaseBillingDemand,
    RentLeaseDemandStatus,
    RentLeaseDemandType,
    Subscription,
    UnifiedCollectionIdempotency,
    UnifiedCollectionIdempotencyStatus,
    q2,
)


REFERENCE_SEQUENCE_PADDING = 5
RENT_LEASE_DISABLED_REASON = (
    "Rent/lease monthly collection is not exposed through a production-safe "
    "posting service in the unified collection flow yet."
)


class CollectionPrimaryAction:
    COLLECT_EMI = "COLLECT_EMI"
    COLLECT_DIRECT_SALE = "COLLECT_DIRECT_SALE"
    VIEW_ONLY = "VIEW_ONLY"
    DISABLED = "DISABLED"


@dataclass(frozen=True)
class BackfillResult:
    scanned: dict[str, int]
    created: dict[str, int]
    existing: dict[str, int]
    skipped: dict[str, int]
    dry_run: bool


def _money(value) -> Decimal:
    return q2(Decimal(str(value or MONEY_ZERO)))


def _money_string(value) -> str:
    return f"{_money(value):.2f}"


def _mask_phone(value: str | None) -> str:
    digits = "".join(ch for ch in (value or "") if ch.isdigit())
    if not digits:
        return ""
    if len(digits) <= 4:
        return "*" * len(digits)
    return f"{'*' * max(len(digits) - 4, 0)}{digits[-4:]}"


def _source_year(value) -> int:
    if isinstance(value, datetime):
        return timezone.localtime(value).year if timezone.is_aware(value) else value.year
    if isinstance(value, date):
        return value.year
    return timezone.localdate().year


def _safe_token(value, *, fallback: str) -> str:
    token = re.sub(r"[^A-Za-z0-9-]+", "", str(value or "").strip().upper())
    return token or fallback


def _customer_code_snapshot(customer) -> str | None:
    customer_code = (getattr(customer, "customer_code", "") or "").strip()
    return customer_code or None


def _partner_snapshot(partner) -> str:
    if not partner:
        return ""
    label = (
        getattr(partner, "get_full_name", lambda: "")()
        or getattr(partner, "first_name", "")
        or getattr(partner, "username", "")
        or f"Partner {getattr(partner, 'id', '')}"
    )
    return str(label).strip()


def _subscription_product_summary(subscription: Subscription) -> str:
    product = getattr(subscription, "product", None)
    if not product:
        return ""
    product_code = (getattr(product, "product_code", "") or "").strip()
    product_name = (getattr(product, "name", "") or "").strip()
    return " - ".join(part for part in [product_code, product_name] if part)


def _direct_sale_product_summary(sale) -> str:
    lines = list(sale.lines.all()[:3])
    descriptions = [
        (getattr(line, "description", "") or "").strip()
        for line in lines
        if (getattr(line, "description", "") or "").strip()
    ]
    if not descriptions:
        return (getattr(sale, "sale_no", "") or f"Direct sale {sale.id}").strip()
    suffix = " ..." if sale.lines.count() > len(descriptions) else ""
    return ", ".join(descriptions)[:245] + suffix


def _sequence_scope(*, contract_type: str, year: int, batch: str = "", lucky: str = "") -> str:
    parts = ["CONTRACT_REFERENCE", contract_type, str(year)]
    if batch:
        parts.append(batch)
    if lucky:
        parts.append(lucky)
    return ":".join(parts)


def _issue_sequence_number(scope_key: str) -> int:
    with transaction.atomic():
        sequence, _ = (
            ContractReferenceSequence.objects.select_for_update().get_or_create(
                scope_key=scope_key,
                defaults={"next_number": 1},
            )
        )
        next_number = sequence.next_number
        sequence.next_number = next_number + 1
        sequence.save(update_fields=["next_number", "updated_at"])
    return next_number


def _plan_to_contract_type(plan_type: str) -> str:
    if plan_type == PlanType.EMI:
        return ContractReferenceType.ADVANCE_EMI
    if plan_type == PlanType.RENT:
        return ContractReferenceType.RENT
    if plan_type == PlanType.LEASE:
        return ContractReferenceType.LEASE
    raise ValueError(f"Unsupported plan type for ContractReference: {plan_type!r}")


def _build_subscription_reference_no(
    *,
    subscription: Subscription,
    contract_type: str,
    sequence_number: int,
) -> str:
    year = _source_year(getattr(subscription, "created_at", None) or subscription.start_date)
    padded = str(sequence_number).zfill(REFERENCE_SEQUENCE_PADDING)

    if contract_type == ContractReferenceType.ADVANCE_EMI:
        batch = _safe_token(
            getattr(getattr(subscription, "batch", None), "batch_code", ""),
            fallback=f"BATCH{subscription.batch_id or subscription.id}",
        )
        lucky = getattr(getattr(subscription, "lucky_id", None), "display_number", None)
        if lucky is None:
            lucky = getattr(getattr(subscription, "lucky_id", None), "lucky_number", "")
        lucky_token = _safe_token(lucky, fallback=str(subscription.lucky_id_id or subscription.id))
        return f"SUB/ADVEMI/{batch}/L{lucky_token}/{year}/{padded}"

    if contract_type == ContractReferenceType.RENT:
        return f"SUB/RENT/{year}/{padded}"

    if contract_type == ContractReferenceType.LEASE:
        return f"SUB/LEASE/{year}/{padded}"

    raise ValueError(f"Unsupported subscription contract reference type: {contract_type!r}")


def _build_direct_sale_reference_no(*, sale, sequence_number: int) -> str:
    year = _source_year(getattr(sale, "sale_date", None) or getattr(sale, "created_at", None))
    padded = str(sequence_number).zfill(REFERENCE_SEQUENCE_PADDING)
    return f"SALE/DIRECT/{year}/{padded}"


def _subscription_sequence_scope(subscription: Subscription, contract_type: str) -> str:
    year = _source_year(getattr(subscription, "created_at", None) or subscription.start_date)
    if contract_type == ContractReferenceType.ADVANCE_EMI:
        batch = _safe_token(
            getattr(getattr(subscription, "batch", None), "batch_code", ""),
            fallback=f"BATCH{subscription.batch_id or subscription.id}",
        )
        lucky = getattr(getattr(subscription, "lucky_id", None), "display_number", None)
        if lucky is None:
            lucky = getattr(getattr(subscription, "lucky_id", None), "lucky_number", "")
        return _sequence_scope(
            contract_type=contract_type,
            year=year,
            batch=batch,
            lucky=_safe_token(lucky, fallback=str(subscription.lucky_id_id or subscription.id)),
        )
    return _sequence_scope(contract_type=contract_type, year=year)


def _direct_sale_sequence_scope(sale) -> str:
    return _sequence_scope(
        contract_type=ContractReferenceType.DIRECT_SALE,
        year=_source_year(getattr(sale, "sale_date", None) or getattr(sale, "created_at", None)),
    )


def ensure_contract_reference_for_subscription(
    subscription: Subscription,
) -> ContractReference:
    subscription = (
        Subscription.objects.select_related(
            "customer",
            "product",
            "batch",
            "lucky_id",
            "partner",
            "rent_profile",
            "lease_profile",
        )
        .filter(pk=subscription.pk)
        .first()
        or subscription
    )
    contract_type = _plan_to_contract_type(subscription.plan_type)
    existing = ContractReference.objects.filter(
        contract_type=contract_type,
        subscription=subscription,
    ).first()
    if existing:
        return existing

    customer = subscription.customer
    batch = getattr(subscription, "batch", None)
    lucky = getattr(subscription, "lucky_id", None)
    rent_profile = getattr(subscription, "rent_profile", None)
    lease_profile = getattr(subscription, "lease_profile", None)
    scope_key = _subscription_sequence_scope(subscription, contract_type)

    for _attempt in range(5):
        sequence_number = _issue_sequence_number(scope_key)
        reference_no = _build_subscription_reference_no(
            subscription=subscription,
            contract_type=contract_type,
            sequence_number=sequence_number,
        )
        try:
            return ContractReference.objects.create(
                reference_no=reference_no,
                display_reference=reference_no,
                contract_type=contract_type,
                customer=customer,
                subscription=subscription,
                rent_contract=rent_profile if contract_type == ContractReferenceType.RENT else None,
                lease_contract=lease_profile if contract_type == ContractReferenceType.LEASE else None,
                phone_snapshot=getattr(customer, "phone", "") or "",
                customer_name_snapshot=getattr(customer, "name", "") or "",
                kyc_reference_snapshot=_customer_code_snapshot(customer),
                product_summary_snapshot=_subscription_product_summary(subscription),
                batch_snapshot=getattr(batch, "batch_code", "") or "",
                lucky_id_snapshot=(
                    str(
                        getattr(lucky, "display_number", None)
                        or getattr(lucky, "lucky_number", "")
                        or ""
                    ).strip().upper()
                ),
                partner_snapshot=_partner_snapshot(getattr(subscription, "partner", None)),
                source_created_at=getattr(subscription, "created_at", None),
                metadata={
                    "source_model": "Subscription",
                    "source_id": subscription.id,
                    "subscription_number": subscription.subscription_number,
                    "contract_reference": subscription.contract_reference,
                    "customer_id": subscription.customer_id,
                    "product_id": subscription.product_id,
                    "partner_id": subscription.partner_id,
                    "batch_id": subscription.batch_id,
                    "lucky_id": subscription.lucky_id_id,
                    "lucky_number": getattr(lucky, "lucky_number", None),
                },
            )
        except IntegrityError:
            continue

    raise ValueError("Unable to allocate a unique contract reference number.")


def ensure_contract_reference_for_direct_sale(direct_sale) -> ContractReference:
    from billing.models import DirectSale

    sale = (
        DirectSale.objects.select_related("customer")
        .prefetch_related("lines", "billing_invoices")
        .filter(pk=direct_sale.pk)
        .first()
        or direct_sale
    )
    existing = ContractReference.objects.filter(
        contract_type=ContractReferenceType.DIRECT_SALE,
        direct_sale=sale,
    ).first()
    if existing:
        return existing

    invoice = sale.billing_invoices.order_by("-id").first()
    customer = getattr(sale, "customer", None)
    scope_key = _direct_sale_sequence_scope(sale)

    for _attempt in range(5):
        sequence_number = _issue_sequence_number(scope_key)
        reference_no = _build_direct_sale_reference_no(
            sale=sale,
            sequence_number=sequence_number,
        )
        try:
            return ContractReference.objects.create(
                reference_no=reference_no,
                display_reference=reference_no,
                contract_type=ContractReferenceType.DIRECT_SALE,
                customer=customer,
                direct_sale=sale,
                invoice=invoice,
                phone_snapshot=(
                    getattr(customer, "phone", "")
                    or getattr(sale, "customer_phone_snapshot", "")
                    or ""
                ),
                customer_name_snapshot=(
                    getattr(customer, "name", "")
                    or getattr(sale, "customer_name_snapshot", "")
                    or ""
                ),
                kyc_reference_snapshot=_customer_code_snapshot(customer) if customer else None,
                product_summary_snapshot=_direct_sale_product_summary(sale),
                source_created_at=getattr(sale, "created_at", None),
                metadata={
                    "source_model": "DirectSale",
                    "source_id": sale.id,
                    "sale_no": sale.sale_no,
                    "invoice_id": getattr(invoice, "id", None),
                    "invoice_no": getattr(invoice, "document_no", None),
                    "customer_id": sale.customer_id,
                    "branch_id": sale.branch_id,
                },
            )
        except IntegrityError:
            continue

    raise ValueError("Unable to allocate a unique direct-sale contract reference.")


def backfill_contract_references(*, dry_run: bool = True) -> BackfillResult:
    scanned = {choice.value: 0 for choice in ContractReferenceType}
    created = {choice.value: 0 for choice in ContractReferenceType}
    existing = {choice.value: 0 for choice in ContractReferenceType}
    skipped = {choice.value: 0 for choice in ContractReferenceType}

    subscriptions = Subscription.objects.select_related(
        "customer",
        "product",
        "batch",
        "lucky_id",
        "partner",
    ).order_by("id")

    for subscription in subscriptions:
        try:
            contract_type = _plan_to_contract_type(subscription.plan_type)
        except ValueError:
            continue
        scanned[contract_type] += 1
        if ContractReference.objects.filter(
            contract_type=contract_type,
            subscription=subscription,
        ).exists():
            existing[contract_type] += 1
            continue
        if dry_run:
            created[contract_type] += 1
            continue
        ensure_contract_reference_for_subscription(subscription)
        created[contract_type] += 1

    try:
        from billing.models import DirectSale
    except Exception:
        skipped[ContractReferenceType.DIRECT_SALE] += 1
    else:
        direct_sales = DirectSale.objects.select_related("customer").order_by("id")
        for sale in direct_sales:
            scanned[ContractReferenceType.DIRECT_SALE] += 1
            if ContractReference.objects.filter(
                contract_type=ContractReferenceType.DIRECT_SALE,
                direct_sale=sale,
            ).exists():
                existing[ContractReferenceType.DIRECT_SALE] += 1
                continue
            if dry_run:
                created[ContractReferenceType.DIRECT_SALE] += 1
                continue
            ensure_contract_reference_for_direct_sale(sale)
            created[ContractReferenceType.DIRECT_SALE] += 1

    return BackfillResult(
        scanned=scanned,
        created=created,
        existing=existing,
        skipped=skipped,
        dry_run=dry_run,
    )


def _apply_role_scope(queryset, *, user, audience: str):
    if audience == "admin" or getattr(user, "role", "") == "ADMIN":
        return queryset
    branch_ids = assigned_branch_ids_for_user(user)
    if not branch_ids:
        return queryset.none()
    return queryset.filter(
        Q(subscription__branch_id__in=branch_ids)
        | Q(direct_sale__branch_id__in=branch_ids)
    )


def _contract_reference_queryset(*, user, audience: str):
    queryset = ContractReference.objects.select_related(
        "customer",
        "subscription",
        "subscription__customer",
        "subscription__product",
        "subscription__batch",
        "subscription__lucky_id",
        "subscription__partner",
        "direct_sale",
        "invoice",
    )
    return _apply_role_scope(queryset, user=user, audience=audience)


def search_contract_references(
    *,
    query: str = "",
    user=None,
    audience: str = "admin",
    limit: int = 50,
):
    queryset = _contract_reference_queryset(user=user, audience=audience)
    query = (query or "").strip()
    if query:
        search_filter = (
            Q(reference_no__icontains=query)
            | Q(display_reference__icontains=query)
            | Q(phone_snapshot__icontains=query)
            | Q(customer_name_snapshot__icontains=query)
            | Q(kyc_reference_snapshot__icontains=query)
            | Q(batch_snapshot__icontains=query)
            | Q(lucky_id_snapshot__icontains=query)
            | Q(product_summary_snapshot__icontains=query)
            | Q(subscription__subscription_number__icontains=query)
            | Q(subscription__contract_reference__icontains=query)
            | Q(direct_sale__sale_no__icontains=query)
            | Q(invoice__document_no__icontains=query)
        )
        if query.isdigit():
            numeric = int(query)
            search_filter |= (
                Q(customer_id=numeric)
                | Q(subscription_id=numeric)
                | Q(direct_sale_id=numeric)
                | Q(subscription__partner_id=numeric)
                | Q(subscription__lucky_id_id=numeric)
                | Q(subscription__lucky_id__lucky_number=numeric)
            )
        queryset = queryset.filter(search_filter)

    return list(queryset.distinct().order_by("-source_created_at", "-id")[:limit])


def _advance_emi_position(subscription: Subscription) -> dict[str, object]:
    rows = []
    overdue_amount = MONEY_ZERO
    today = timezone.localdate()
    for emi in subscription.emis.order_by("due_date", "month_no", "id"):
        status = str(emi.status or "").upper()
        if status in {EmiStatus.PAID, EmiStatus.WAIVED}:
            continue
        balance = emi.balance_amount()
        if balance <= MONEY_ZERO:
            continue
        rows.append((emi, balance))
        if emi.due_date and emi.due_date < today:
            overdue_amount += balance

    next_emi, next_amount = rows[0] if rows else (None, MONEY_ZERO)
    return {
        "due_amount": _money(next_amount),
        "overdue_amount": _money(overdue_amount),
        "next_due_date": getattr(next_emi, "due_date", None),
        "status": getattr(next_emi, "status", None) or subscription.status,
        "emi_id": getattr(next_emi, "id", None),
        "allowed_actions": ["COLLECT_EMI"] if next_emi else [],
        "disabled_reason": None if next_emi else "No collectible EMI is currently pending.",
    }


def rent_lease_receivable_position(subscription: Subscription) -> dict[str, object]:
    demands = list(
        RentLeaseBillingDemand.objects.filter(subscription=subscription)
        .exclude(status__in=[RentLeaseDemandStatus.CANCELLED, RentLeaseDemandStatus.WAIVED])
        .order_by("due_date", "id")
    )
    today = timezone.localdate()
    outstanding_rows = []
    overdue_amount = MONEY_ZERO
    for demand in demands:
        outstanding = demand.outstanding_amount()
        if outstanding <= MONEY_ZERO:
            continue
        outstanding_rows.append((demand, outstanding))
        if demand.due_date and demand.due_date < today:
            overdue_amount += outstanding
    next_demand, next_amount = outstanding_rows[0] if outstanding_rows else (None, MONEY_ZERO)
    return {
        "due_amount": _money(next_amount),
        "overdue_amount": _money(overdue_amount),
        "next_due_date": getattr(next_demand, "due_date", None),
        "status": getattr(next_demand, "status", None) or subscription.status,
        "demand_id": getattr(next_demand, "id", None),
        "demand_type": getattr(next_demand, "demand_type", None),
        "allowed_actions": [],
        "disabled_reason": RENT_LEASE_DISABLED_REASON,
    }


def _receivable_position_bundle(reference: ContractReference) -> dict[str, object]:
    source_type = reference.contract_type
    if source_type == ContractReferenceType.ADVANCE_EMI and reference.subscription_id:
        return _advance_emi_position(reference.subscription)
    if source_type in {ContractReferenceType.RENT, ContractReferenceType.LEASE} and reference.subscription_id:
        return rent_lease_receivable_position(reference.subscription)
    if source_type == ContractReferenceType.DIRECT_SALE and reference.direct_sale_id:
        return direct_sale_receivable_position(reference.direct_sale)
    return {
        "due_amount": MONEY_ZERO,
        "overdue_amount": MONEY_ZERO,
        "next_due_date": None,
        "status": "UNSUPPORTED",
        "allowed_actions": [],
        "disabled_reason": "Source record is not linked to a supported receivable.",
    }


def _derive_collection_action_state(
    contract_type: str,
    position: dict[str, object],
) -> dict[str, object]:
    allowed = list(position.get("allowed_actions") or [])
    dr = position.get("disabled_reason")
    if contract_type == ContractReferenceType.ADVANCE_EMI:
        if "COLLECT_EMI" in allowed:
            return {
                "primary_action": CollectionPrimaryAction.COLLECT_EMI,
                "allowed_actions": allowed,
                "disabled_reason": None,
            }
        return {
            "primary_action": CollectionPrimaryAction.DISABLED,
            "allowed_actions": [],
            "disabled_reason": dr,
        }
    if contract_type in {ContractReferenceType.RENT, ContractReferenceType.LEASE}:
        return {
            "primary_action": CollectionPrimaryAction.VIEW_ONLY,
            "allowed_actions": [],
            "disabled_reason": dr,
        }
    if contract_type == ContractReferenceType.DIRECT_SALE:
        if "COLLECT_DIRECT_SALE" in allowed:
            return {
                "primary_action": CollectionPrimaryAction.COLLECT_DIRECT_SALE,
                "allowed_actions": allowed,
                "disabled_reason": None,
            }
        if dr:
            return {
                "primary_action": CollectionPrimaryAction.VIEW_ONLY,
                "allowed_actions": [],
                "disabled_reason": dr,
            }
        return {
            "primary_action": CollectionPrimaryAction.DISABLED,
            "allowed_actions": [],
            "disabled_reason": dr or "Direct sale has no collectible balance in this flow.",
        }
    return {
        "primary_action": CollectionPrimaryAction.DISABLED,
        "allowed_actions": [],
        "disabled_reason": str(dr or "Unsupported contract type."),
    }


def get_collection_action_state(reference: ContractReference) -> dict[str, object]:
    position = _receivable_position_bundle(reference)
    return _derive_collection_action_state(reference.contract_type, position)


def build_canonical_collection_route(
    reference: ContractReference,
    primary_action: str,
    *,
    audience: str = "admin",
) -> str:
    aud = (audience or "admin").strip().lower()
    is_cashier = aud == "cashier"
    sub_id = reference.subscription_id
    ds_id = reference.direct_sale_id
    if primary_action == CollectionPrimaryAction.COLLECT_EMI and sub_id:
        return (
            f"/cashier/collect?subscription={sub_id}"
            if is_cashier
            else f"/admin/finance/collect?subscription={sub_id}"
        )
    if primary_action == CollectionPrimaryAction.COLLECT_DIRECT_SALE and ds_id:
        return (
            f"/cashier/collect?workflow=direct-sale&direct_sale={ds_id}"
            if is_cashier
            else f"/admin/finance/collect?workflow=direct-sale&direct_sale={ds_id}"
        )
    if sub_id:
        return (
            f"/admin/subscriptions/{sub_id}"
            if not is_cashier
            else "/cashier/collect"
        )
    if ds_id:
        return (
            f"/admin/billing/direct-sales/{ds_id}"
            if not is_cashier
            else "/cashier/collect?workflow=direct-sale"
        )
    return "/cashier/collect" if is_cashier else "/admin/finance/collect"


def resolve_contract_reference_row(
    reference: ContractReference,
    *,
    audience: str = "admin",
) -> dict[str, object]:
    state = get_collection_action_state(reference)
    source_id = (
        reference.direct_sale_id
        or reference.subscription_id
        or reference.invoice_id
    )
    route = build_canonical_collection_route(
        reference, str(state["primary_action"]), audience=audience
    )
    return {
        "contract_reference_id": reference.id,
        "source_type": reference.contract_type,
        "source_id": source_id,
        "route": route,
        "primary_action": state["primary_action"],
        "allowed_actions": state["allowed_actions"],
        "disabled_reason": state["disabled_reason"],
    }


def _unified_collection_fingerprint(
    *,
    source_type: str,
    source_id: int,
    amount,
    payment_method: str,
    finance_account_id: int,
) -> str:
    amt = q2(Decimal(str(amount)))
    raw = f"{(source_type or '').strip().upper()}|{source_id}|{amt}|{(payment_method or '').strip().upper()}|{finance_account_id}"
    return hashlib.sha256(raw.encode()).hexdigest()


def direct_sale_receivable_position(sale) -> dict[str, object]:
    from billing.services.direct_sale_collection_service import (
        get_direct_sale_receivable_position,
    )

    position = get_direct_sale_receivable_position(direct_sale_id=sale.id)
    outstanding = _money(position["outstanding"])
    invoice = position.get("invoice")
    service_ready = bool(position.get("collection_supported"))
    disabled_reason = position.get("disabled_reason")
    return {
        "due_amount": outstanding,
        "overdue_amount": MONEY_ZERO,
        "next_due_date": None,
        "status": getattr(sale, "status", "") or getattr(invoice, "status", "") or "",
        "invoice_id": getattr(invoice, "id", None),
        "allowed_actions": ["COLLECT_DIRECT_SALE"] if service_ready and outstanding > MONEY_ZERO else [],
        "disabled_reason": None if service_ready and outstanding > MONEY_ZERO else disabled_reason,
    }


def build_receivable_result(
    reference: ContractReference,
    *,
    audience: str = "admin",
) -> dict[str, object]:
    source_type = reference.contract_type
    source_id = (
        reference.direct_sale_id
        or reference.subscription_id
        or reference.invoice_id
    )
    position = _receivable_position_bundle(reference)
    state = _derive_collection_action_state(source_type, position)
    collection_route = build_canonical_collection_route(
        reference, str(state["primary_action"]), audience=audience
    )

    return {
        "contract_reference_id": reference.id,
        "source_type": source_type,
        "source_id": source_id,
        "reference_no": reference.reference_no,
        "display_reference": reference.display_reference,
        "customer_id": reference.customer_id,
        "customer_name": reference.customer_name_snapshot,
        "phone_masked": _mask_phone(reference.phone_snapshot),
        "product_summary": reference.product_summary_snapshot,
        "due_amount": _money_string(position.get("due_amount")),
        "overdue_amount": _money_string(position.get("overdue_amount")),
        "next_due_date": position.get("next_due_date"),
        "status": position.get("status") or "",
        "primary_action": state["primary_action"],
        "allowed_actions": state["allowed_actions"],
        "disabled_reason": state["disabled_reason"],
        "collection_route": collection_route,
    }


def search_receivables(
    *,
    query: str = "",
    user=None,
    audience: str = "admin",
    limit: int = 50,
) -> list[dict[str, object]]:
    references = search_contract_references(
        query=query,
        user=user,
        audience=audience,
        limit=limit,
    )
    return [
        build_receivable_result(reference, audience=audience)
        for reference in references
    ]


def collect_unified_receivable(
    *,
    source_type: str,
    source_id: int,
    amount,
    payment_method: str,
    finance_account_id: int,
    collected_by,
    reference_no: str | None = None,
    payment_date=None,
    branch_id: int | None = None,
    cash_counter_id: int | None = None,
    note: str | None = None,
    idempotency_key: str | None = None,
    contract_reference_id: int | None = None,
) -> tuple[dict[str, object], int]:
    from services.collection_router import route_collection

    source_type = (source_type or "").strip().upper()
    payment_method = (payment_method or "CASH").strip().upper()
    idem = (idempotency_key or "").strip()

    fingerprint = _unified_collection_fingerprint(
        source_type=source_type,
        source_id=source_id,
        amount=amount,
        payment_method=payment_method,
        finance_account_id=finance_account_id,
    )

    def _dispatch() -> tuple[dict[str, object], int]:
        result = route_collection(
            source_type=source_type,
            source_id=source_id,
            collected_by=collected_by,
            amount=amount,
            payment_method=payment_method,
            finance_account_id=finance_account_id,
            reference_no=reference_no,
            payment_date=payment_date,
            branch_id=branch_id,
            cash_counter_id=cash_counter_id,
            note=note,
            contract_reference_id=contract_reference_id,
        )
        status_code = 201 if result.get("created", True) else 200
        return result, status_code

    if idem:
        with transaction.atomic():
            row = (
                UnifiedCollectionIdempotency.objects.select_for_update()
                .filter(user_id=collected_by.id, key=idem)
                .first()
            )
            if row:
                if row.fingerprint != fingerprint:
                    raise ValidationError(
                        {
                            "idempotency_key": (
                                "Idempotency key was reused with different collection parameters."
                            )
                        }
                    )
                if row.status == UnifiedCollectionIdempotencyStatus.COMPLETED:
                    return dict(row.response_body), 200
                raise ValidationError(
                    {
                        "idempotency_key": (
                            "A collection request with this idempotency key is already in progress."
                        )
                    }
                )
            UnifiedCollectionIdempotency.objects.create(
                user=collected_by,
                key=idem,
                fingerprint=fingerprint,
                status=UnifiedCollectionIdempotencyStatus.PENDING,
            )
            try:
                result, status_code = _dispatch()
            except Exception:
                UnifiedCollectionIdempotency.objects.filter(user=collected_by, key=idem).delete()
                raise
            body = {k: v for k, v in result.items()}
            UnifiedCollectionIdempotency.objects.filter(user=collected_by, key=idem).update(
                status=UnifiedCollectionIdempotencyStatus.COMPLETED,
                response_body=body,
                response_status=status_code,
            )
            return result, status_code

    result, status_code = _dispatch()
    return result, status_code

