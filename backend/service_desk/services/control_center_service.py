"""Unified Service Desk control-center search.

One text/ID query resolved across the entities an admin needs when handling a
customer's product issue: customers, service-desk cases, warranty claims,
returns (credit/debit notes), direct sales, and contracts. This is the cross-
entity lookup the dashboard-style ``build_admin_global_search`` never provided.

All querysets are read-only and reuse the existing FK graph on
``ServiceDeskCase`` so a single match expands to its linked sale/contract/return.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db.models import Q

from billing.models import BillingCreditNote, BillingDebitNote, DirectSale
from contracts.models import Subscription
from customers.models import Customer
from service_desk.models import ServiceDeskCase, WarrantyClaim

GROUP_LIMIT = 15


def _money(value: Any) -> str:
    try:
        return f"{Decimal(value or 0):.2f}"
    except Exception:
        return "0.00"


def _iso(value: Any) -> str | None:
    return value.isoformat() if value is not None else None


# --- row builders -----------------------------------------------------------


def _customer_row(customer: Customer) -> dict[str, Any]:
    return {
        "kind": "customer",
        "id": customer.id,
        "label": customer.name,
        "sublabel": customer.phone,
        "href": f"/admin/customers/{customer.id}",
        "status": None,
        "customer_name": customer.name,
        "customer_phone": customer.phone,
        "amount": None,
        "date": _iso(getattr(customer, "created_at", None)),
    }


def _case_row(case: ServiceDeskCase) -> dict[str, Any]:
    party = case.party
    return {
        "kind": "service_case",
        "id": case.id,
        "label": case.case_no,
        "sublabel": f"{case.get_case_type_display()} · {case.issue_summary}",
        "href": f"/admin/service-desk/cases/{case.id}",
        "status": case.status,
        "customer_name": (party.display_name if party else case.reporter_name_snapshot),
        "customer_phone": (party.primary_phone if party else case.reporter_phone_snapshot),
        "amount": _money(case.total_amount),
        "date": _iso(case.created_at),
    }


def _warranty_row(claim: WarrantyClaim) -> dict[str, Any]:
    sub = claim.subscription
    customer = sub.customer if sub else None
    return {
        "kind": "warranty_claim",
        "id": claim.id,
        "label": f"WARRANTY-{claim.id}",
        "sublabel": (claim.product.name if claim.product_id else "") or claim.defect_description[:60],
        "href": "/admin/warranty/claims",
        "status": claim.claim_status,
        "customer_name": (customer.name if customer else None),
        "customer_phone": (customer.phone if customer else None),
        "amount": None,
        "date": _iso(claim.claim_submitted_at),
    }


def _note_row(note: Any, kind_label: str) -> dict[str, Any]:
    return {
        "kind": "return",
        "id": note.id,
        "label": note.note_no,
        "sublabel": kind_label,
        "href": "/admin/service-desk/returns",
        "status": getattr(note, "status", None),
        "customer_name": None,
        "customer_phone": None,
        "amount": _money(getattr(note, "total_amount", 0)),
        "date": _iso(getattr(note, "created_at", None)),
    }


def _sale_row(sale: DirectSale) -> dict[str, Any]:
    return {
        "kind": "direct_sale",
        "id": sale.id,
        "label": sale.sale_no or f"SALE#{sale.id}",
        "sublabel": sale.get_status_display() if hasattr(sale, "get_status_display") else "",
        "href": "/admin/billing/direct-sale",
        "status": getattr(sale, "status", None),
        "customer_name": (sale.customer.name if sale.customer_id else sale.customer_name_snapshot),
        "customer_phone": (sale.customer.phone if sale.customer_id else sale.customer_phone_snapshot),
        "amount": _money(getattr(sale, "total_amount", 0)),
        "date": _iso(getattr(sale, "created_at", None)),
    }


def _contract_row(sub: Subscription) -> dict[str, Any]:
    customer = sub.customer if sub.customer_id else None
    return {
        "kind": "contract",
        "id": sub.id,
        "label": sub.subscription_number or sub.contract_reference or f"SUB-{sub.id}",
        "sublabel": f"{sub.plan_type} · {sub.status}",
        "href": f"/admin/subscriptions/{sub.id}",
        "status": sub.status,
        "customer_name": (customer.name if customer else None),
        "customer_phone": (customer.phone if customer else None),
        "amount": _money(sub.total_amount),
        "date": _iso(getattr(sub, "created_at", None)),
    }


# --- search + resolve -------------------------------------------------------


def build_service_control_search(query: str) -> dict[str, Any]:
    """Resolve a single query across every product-issue entity."""
    q = (query or "").strip()
    if not q:
        return {"query": "", "groups": [], "total": 0}

    is_num = q.isdigit()
    groups: list[dict[str, Any]] = []
    total = 0

    def add(kind_key: str, label: str, rows: list[dict[str, Any]]) -> None:
        nonlocal total
        if rows:
            groups.append({"kind": kind_key, "label": label, "results": rows})
            total += len(rows)

    # Customers (name / phone / id)
    cust_q = Q(name__icontains=q) | Q(phone__icontains=q)
    if is_num:
        cust_q |= Q(id=int(q))
    add(
        "customer",
        "Customers",
        [_customer_row(c) for c in Customer.objects.filter(cust_q).order_by("name")[:GROUP_LIMIT]],
    )

    # Service cases (case_no / customer / sale / notes / id) — reuse FK graph
    case_q = (
        Q(case_no__icontains=q)
        | Q(issue_summary__icontains=q)
        | Q(party__display_name__icontains=q)
        | Q(party__primary_phone__icontains=q)
        | Q(reporter_name_snapshot__icontains=q)
        | Q(reporter_phone_snapshot__icontains=q)
        | Q(direct_sale__sale_no__icontains=q)
        | Q(credit_note__note_no__icontains=q)
        | Q(debit_note__note_no__icontains=q)
    )
    if is_num:
        case_q |= Q(id=int(q))
    cases = (
        ServiceDeskCase.objects.select_related("party", "direct_sale", "subscription")
        .filter(case_q)
        .order_by("-created_at")[:GROUP_LIMIT]
    )
    add("service_case", "Service cases", [_case_row(c) for c in cases])

    # Warranty claims (id / product / customer)
    warranty_q = (
        Q(product__name__icontains=q)
        | Q(subscription__customer__name__icontains=q)
        | Q(subscription__customer__phone__icontains=q)
        | Q(defect_description__icontains=q)
    )
    if is_num:
        warranty_q |= Q(id=int(q))
    claims = (
        WarrantyClaim.objects.select_related("product", "subscription__customer")
        .filter(warranty_q)
        .order_by("-claim_submitted_at")[:GROUP_LIMIT]
    )
    add("warranty_claim", "Warranty claims", [_warranty_row(c) for c in claims])

    # Returns (credit + debit notes by note_no / id)
    note_rows: list[dict[str, Any]] = []
    cn_q = Q(note_no__icontains=q)
    dn_q = Q(note_no__icontains=q)
    if is_num:
        cn_q |= Q(id=int(q))
        dn_q |= Q(id=int(q))
    note_rows += [_note_row(n, "Credit note (return)") for n in BillingCreditNote.objects.filter(cn_q).order_by("-id")[:GROUP_LIMIT]]
    note_rows += [_note_row(n, "Debit note") for n in BillingDebitNote.objects.filter(dn_q).order_by("-id")[:GROUP_LIMIT]]
    add("return", "Returns / notes", note_rows[:GROUP_LIMIT])

    # Direct sales (sale_no / customer / id)
    sale_q = (
        Q(sale_no__icontains=q)
        | Q(customer__name__icontains=q)
        | Q(customer__phone__icontains=q)
        | Q(customer_name_snapshot__icontains=q)
        | Q(customer_phone_snapshot__icontains=q)
    )
    if is_num:
        sale_q |= Q(id=int(q))
    sales = DirectSale.objects.select_related("customer").filter(sale_q).order_by("-id")[:GROUP_LIMIT]
    add("direct_sale", "Direct sales", [_sale_row(s) for s in sales])

    # Contracts (subscription_number / contract_reference / customer / id)
    contract_q = (
        Q(subscription_number__icontains=q)
        | Q(contract_reference__icontains=q)
        | Q(customer__name__icontains=q)
        | Q(customer__phone__icontains=q)
    )
    if is_num:
        contract_q |= Q(id=int(q))
    contracts = Subscription.objects.select_related("customer").filter(contract_q).order_by("-id")[:GROUP_LIMIT]
    add("contract", "Contracts", [_contract_row(s) for s in contracts])

    return {"query": q, "groups": groups, "total": total}


def resolve_issue_timeline(
    *,
    customer_id: int | None = None,
    direct_sale_id: int | None = None,
    subscription_id: int | None = None,
) -> dict[str, Any]:
    """Full product-issue history for a chosen customer / sale / contract."""
    case_qs = ServiceDeskCase.objects.select_related("party", "direct_sale", "subscription")
    filters = Q()
    customer: Customer | None = None

    if customer_id:
        customer = Customer.objects.filter(id=customer_id).first()
        # PartyMaster links to a customer via PartyLink (no direct FK), so anchor the
        # customer timeline on the sale/subscription customer FKs.
        filters |= Q(direct_sale__customer_id=customer_id) | Q(subscription__customer_id=customer_id)
    if direct_sale_id:
        filters |= Q(direct_sale_id=direct_sale_id) | Q(replacement_direct_sale_id=direct_sale_id)
    if subscription_id:
        filters |= Q(subscription_id=subscription_id)

    cases = list(case_qs.filter(filters).order_by("-created_at")[:50]) if filters else []

    warranty_filter = Q()
    if subscription_id:
        warranty_filter |= Q(subscription_id=subscription_id)
    if customer_id:
        warranty_filter |= Q(subscription__customer_id=customer_id)
    claims = (
        list(WarrantyClaim.objects.select_related("product", "subscription__customer").filter(warranty_filter).order_by("-claim_submitted_at")[:50])
        if warranty_filter
        else []
    )

    return {
        "customer": _customer_row(customer) if customer else None,
        "service_cases": [_case_row(c) for c in cases],
        "warranty_claims": [_warranty_row(c) for c in claims],
        "returns": [
            _note_row(c.credit_note, "Credit note (return)")
            for c in cases
            if c.credit_note_id
        ],
        "counts": {
            "service_cases": len(cases),
            "warranty_claims": len(claims),
        },
    }
