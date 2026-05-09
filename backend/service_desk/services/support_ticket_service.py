from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from accounts.models import User
from billing.models import BillingInvoice, DirectSale
from crm.models import PartyMaster
from service_desk.support_ticket_models import (
    SupportTicket,
    SupportTicketComment,
    SupportTicketEvent,
    SupportTicketEventType,
    SupportTicketLink,
    SupportTicketLinkType,
    SupportTicketPriority,
    SupportTicketSource,
    SupportTicketStatus,
)
from service_desk.services.support_ticket_numbering import issue_next_support_ticket_no
from subscriptions.models import (
    Batch,
    Customer,
    Emi,
    EmiStatus,
    LeaseSubscriptionProfile,
    LuckyId,
    Payment,
    PlanType,
    Product,
    RentSubscriptionProfile,
    Subscription,
    SubscriptionDelivery,
)
from subscriptions.services.customer_support_service import validate_assignable_user


def _log_event(
    *,
    ticket: SupportTicket,
    event_type: str,
    actor: User | None,
    payload: dict | None = None,
) -> SupportTicketEvent:
    return SupportTicketEvent.objects.create(
        ticket=ticket,
        event_type=event_type,
        actor=actor,
        payload=payload or {},
    )


def _normalize(s: str | None) -> str:
    return (s or "").strip()


@transaction.atomic
def create_customer_ticket(
    *,
    customer: Customer,
    created_by: User,
    category: str,
    subject: str,
    description: str,
    priority: str = SupportTicketPriority.NORMAL,
    preferred_contact_time: str = "",
) -> SupportTicket:
    ticket_no = issue_next_support_ticket_no()
    ticket = SupportTicket.objects.create(
        ticket_no=ticket_no,
        customer=customer,
        created_by=created_by,
        category=(category or "").strip().upper(),
        subject=subject,
        description=description,
        source=SupportTicketSource.CUSTOMER_PORTAL,
        priority=(priority or SupportTicketPriority.NORMAL).strip().upper(),
        preferred_contact_time=preferred_contact_time,
        status=SupportTicketStatus.OPEN,
    )
    _log_event(
        ticket=ticket,
        event_type=SupportTicketEventType.CREATED,
        actor=created_by,
        payload={"source": ticket.source, "category": ticket.category},
    )
    return ticket


@transaction.atomic
def create_admin_ticket(
    *,
    created_by: User,
    category: str,
    subject: str,
    description: str,
    customer: Customer | None = None,
    priority: str = SupportTicketPriority.NORMAL,
    source: str = SupportTicketSource.ADMIN,
    preferred_contact_time: str = "",
) -> SupportTicket:
    ticket_no = issue_next_support_ticket_no()
    ticket = SupportTicket.objects.create(
        ticket_no=ticket_no,
        customer=customer,
        created_by=created_by,
        category=(category or "").strip().upper(),
        subject=subject,
        description=description,
        source=(source or SupportTicketSource.ADMIN).strip().upper(),
        priority=(priority or SupportTicketPriority.NORMAL).strip().upper(),
        preferred_contact_time=preferred_contact_time,
        status=SupportTicketStatus.OPEN,
    )
    _log_event(
        ticket=ticket,
        event_type=SupportTicketEventType.CREATED,
        actor=created_by,
        payload={"source": ticket.source, "category": ticket.category, "customer_id": customer.id if customer else None},
    )
    return ticket


def _assert_ticket_customer(ticket: SupportTicket, customer: Customer):
    if ticket.customer_id is None or ticket.customer_id != customer.id:
        raise ValueError("Ticket does not belong to this customer.")


@transaction.atomic
def add_customer_comment(
    *,
    ticket: SupportTicket,
    customer: Customer,
    author: User,
    body: str,
) -> SupportTicketComment:
    _assert_ticket_customer(ticket, customer)
    text = _normalize(body)
    if not text:
        raise ValueError("Comment cannot be empty.")
    comment = SupportTicketComment.objects.create(
        ticket=ticket,
        author=author,
        body=text,
        is_internal=False,
    )
    _log_event(
        ticket=ticket,
        event_type=SupportTicketEventType.COMMENTED,
        actor=author,
        payload={"comment_id": comment.id},
    )
    return comment


@transaction.atomic
def add_admin_comment(
    *,
    ticket: SupportTicket,
    author: User,
    body: str,
) -> SupportTicketComment:
    text = _normalize(body)
    if not text:
        raise ValueError("Comment cannot be empty.")
    comment = SupportTicketComment.objects.create(
        ticket=ticket,
        author=author,
        body=text,
        is_internal=False,
    )
    _log_event(
        ticket=ticket,
        event_type=SupportTicketEventType.COMMENTED,
        actor=author,
        payload={"comment_id": comment.id, "visibility": "public"},
    )
    return comment


@transaction.atomic
def add_internal_note(
    *,
    ticket: SupportTicket,
    author: User,
    body: str,
) -> SupportTicketComment:
    text = _normalize(body)
    if not text:
        raise ValueError("Internal note cannot be empty.")
    comment = SupportTicketComment.objects.create(
        ticket=ticket,
        author=author,
        body=text,
        is_internal=True,
    )
    _log_event(
        ticket=ticket,
        event_type=SupportTicketEventType.INTERNAL_NOTE_ADDED,
        actor=author,
        payload={"comment_id": comment.id},
    )
    return comment


@transaction.atomic
def assign_ticket(
    *,
    ticket: SupportTicket,
    assignee: User | None,
    performed_by: User,
) -> SupportTicket:
    validate_assignable_user(assignee)
    previous_id = ticket.assigned_to_id
    next_id = assignee.id if assignee else None
    if previous_id == next_id:
        return ticket
    ticket.assigned_to = assignee
    ticket.save(update_fields=["assigned_to", "updated_at"])
    _log_event(
        ticket=ticket,
        event_type=SupportTicketEventType.ASSIGNED,
        actor=performed_by,
        payload={"previous_assignee_id": previous_id, "next_assignee_id": next_id},
    )
    return ticket


def _validate_ticket_scope_for_link(ticket: SupportTicket, link_type: str, customer: Customer | None):
    if ticket.customer_id is None:
        return
    must_resolve_customer = {
        SupportTicketLinkType.CUSTOMER,
        SupportTicketLinkType.SUBSCRIPTION,
        SupportTicketLinkType.EMI,
        SupportTicketLinkType.PAYMENT,
        SupportTicketLinkType.DELIVERY,
        SupportTicketLinkType.BILLING_INVOICE,
        SupportTicketLinkType.DIRECT_SALE,
        SupportTicketLinkType.RENT_CONTRACT,
        SupportTicketLinkType.LEASE_CONTRACT,
    }
    lt = (link_type or "").strip().lower()
    if lt in must_resolve_customer and customer is None:
        raise ValueError("Linked operational record is not attributable to a customer for this ticket.")
    if customer is not None and customer.id != ticket.customer_id:
        raise ValueError("Linked record does not belong to this ticket customer.")


def _resolve_link_target(link_type: str, object_id: int) -> tuple[str, dict[str, Any]]:
    lt = (link_type or "").strip().lower()
    if lt == SupportTicketLinkType.CUSTOMER:
        obj = Customer.objects.get(pk=object_id)
        return lt, {"customer": obj}
    if lt == SupportTicketLinkType.SUBSCRIPTION:
        obj = Subscription.objects.select_related("customer").get(pk=object_id)
        return lt, {"subscription": obj}
    if lt == SupportTicketLinkType.EMI:
        obj = Emi.objects.select_related("subscription", "subscription__customer").get(pk=object_id)
        return lt, {"emi": obj}
    if lt == SupportTicketLinkType.PAYMENT:
        obj = Payment.objects.select_related("customer", "subscription").get(pk=object_id)
        return lt, {"payment": obj}
    if lt == SupportTicketLinkType.PRODUCT:
        obj = Product.objects.get(pk=object_id)
        return lt, {"product": obj}
    if lt == SupportTicketLinkType.BATCH:
        obj = Batch.objects.get(pk=object_id)
        return lt, {"batch": obj}
    if lt == SupportTicketLinkType.LUCKY_ID:
        obj = LuckyId.objects.get(pk=object_id)
        return lt, {"lucky_id": obj}
    if lt == SupportTicketLinkType.DIRECT_SALE:
        obj = DirectSale.objects.select_related("customer").get(pk=object_id)
        return lt, {"direct_sale": obj}
    if lt == SupportTicketLinkType.BILLING_INVOICE:
        obj = BillingInvoice.objects.select_related("subscription", "direct_sale").get(pk=object_id)
        return lt, {"billing_invoice": obj}
    if lt == SupportTicketLinkType.DELIVERY:
        obj = SubscriptionDelivery.objects.select_related("subscription", "subscription__customer").get(pk=object_id)
        return lt, {"delivery": obj}
    if lt == SupportTicketLinkType.RENT_CONTRACT:
        obj = RentSubscriptionProfile.objects.select_related("subscription", "subscription__customer").get(pk=object_id)
        return lt, {"rent_contract": obj}
    if lt == SupportTicketLinkType.LEASE_CONTRACT:
        obj = LeaseSubscriptionProfile.objects.select_related("subscription", "subscription__customer").get(pk=object_id)
        return lt, {"lease_contract": obj}
    if lt == SupportTicketLinkType.PARTNER:
        obj = PartyMaster.objects.get(pk=object_id)
        return lt, {"partner": obj}
    raise ValueError("Unsupported link type.")


def _ownership_for_link(lt: str, data: dict[str, Any]) -> Customer | None:
    if lt == SupportTicketLinkType.CUSTOMER:
        return data["customer"]
    if lt == SupportTicketLinkType.SUBSCRIPTION:
        return data["subscription"].customer
    if lt == SupportTicketLinkType.EMI:
        return data["emi"].subscription.customer
    if lt == SupportTicketLinkType.PAYMENT:
        return data["payment"].customer
    if lt == SupportTicketLinkType.DIRECT_SALE:
        return getattr(data["direct_sale"], "customer", None)
    if lt == SupportTicketLinkType.BILLING_INVOICE:
        inv = data["billing_invoice"]
        if inv.subscription_id:
            return inv.subscription.customer
        if inv.direct_sale_id and getattr(inv.direct_sale, "customer_id", None):
            return inv.direct_sale.customer
        return None
    if lt == SupportTicketLinkType.DELIVERY:
        return data["delivery"].subscription.customer
    if lt == SupportTicketLinkType.RENT_CONTRACT:
        return data["rent_contract"].subscription.customer
    if lt == SupportTicketLinkType.LEASE_CONTRACT:
        return data["lease_contract"].subscription.customer
    return None


@transaction.atomic
def link_ticket_to_object(
    *,
    ticket: SupportTicket,
    link_type: str,
    object_id: int,
    performed_by: User,
) -> SupportTicketLink:
    lt, data = _resolve_link_target(link_type, object_id)
    scoped_customer = _ownership_for_link(lt, data)
    _validate_ticket_scope_for_link(ticket, lt, scoped_customer)

    link = SupportTicketLink(ticket=ticket, link_type=lt, created_by=performed_by, **data)
    link.full_clean()
    link.save()
    _log_event(
        ticket=ticket,
        event_type=SupportTicketEventType.LINKED,
        actor=performed_by,
        payload={"link_type": lt, "object_id": object_id},
    )
    return link


@transaction.atomic
def change_ticket_status(
    *,
    ticket: SupportTicket,
    next_status: str,
    performed_by: User,
    note: str | None = None,
) -> SupportTicket:
    """Update workflow status only. Use resolve_ticket / close_ticket / reject_ticket / reopen_ticket for terminal transitions."""
    current = ticket.status
    nxt = (next_status or "").strip().upper()
    if nxt not in SupportTicketStatus.values:
        raise ValueError("Invalid status.")
    if current == nxt:
        return ticket

    ticket.status = nxt
    ticket.save(update_fields=["status", "updated_at"])
    payload = {"from": current, "to": nxt}
    if note:
        payload["note"] = note[:500]
    _log_event(
        ticket=ticket,
        event_type=SupportTicketEventType.STATUS_CHANGED,
        actor=performed_by,
        payload=payload,
    )
    return ticket


@transaction.atomic
def change_ticket_priority(
    *,
    ticket: SupportTicket,
    next_priority: str,
    performed_by: User,
) -> SupportTicket:
    nxt = (next_priority or "").strip().upper()
    if nxt not in SupportTicketPriority.values:
        raise ValueError("Invalid priority.")
    prev = ticket.priority
    if prev == nxt:
        return ticket
    ticket.priority = nxt
    ticket.save(update_fields=["priority", "updated_at"])
    _log_event(
        ticket=ticket,
        event_type=SupportTicketEventType.PRIORITY_CHANGED,
        actor=performed_by,
        payload={"from": prev, "to": nxt},
    )
    return ticket


@transaction.atomic
def resolve_ticket(
    *,
    ticket: SupportTicket,
    performed_by: User,
    resolution_summary: str,
) -> SupportTicket:
    summary = _normalize(resolution_summary)
    if not summary:
        raise ValueError("Resolution summary is required.")
    ticket.resolution_summary = summary
    ticket.status = SupportTicketStatus.RESOLVED
    now = timezone.now()
    ticket.resolved_at = now
    ticket.resolved_by = performed_by
    ticket.save(
        update_fields=[
            "resolution_summary",
            "status",
            "resolved_at",
            "resolved_by",
            "updated_at",
        ]
    )
    _log_event(
        ticket=ticket,
        event_type=SupportTicketEventType.RESOLVED,
        actor=performed_by,
        payload={"summary_excerpt": summary[:300]},
    )
    return ticket


@transaction.atomic
def close_ticket(
    *,
    ticket: SupportTicket,
    performed_by: User,
    note: str | None = None,
) -> SupportTicket:
    now = timezone.now()
    ticket.status = SupportTicketStatus.CLOSED
    ticket.closed_at = now
    ticket.closed_by = performed_by
    update_fields = ["status", "closed_at", "closed_by", "updated_at"]
    if note:
        extra = _normalize(note)
        if extra:
            ticket.resolution_summary = f"{ticket.resolution_summary}\n\n{extra}".strip() if ticket.resolution_summary else extra
            update_fields.append("resolution_summary")
    ticket.save(update_fields=update_fields)
    _log_event(
        ticket=ticket,
        event_type=SupportTicketEventType.CLOSED,
        actor=performed_by,
        payload={"note": (note or "")[:300]},
    )
    return ticket


@transaction.atomic
def reject_ticket(
    *,
    ticket: SupportTicket,
    performed_by: User,
    reason: str,
) -> SupportTicket:
    text = _normalize(reason)
    if not text:
        raise ValueError("Rejection reason is required.")
    prev = ticket.status
    ticket.status = SupportTicketStatus.REJECTED
    ticket.resolution_summary = text
    now = timezone.now()
    ticket.resolved_at = now
    ticket.resolved_by = performed_by
    ticket.closed_at = now
    ticket.closed_by = performed_by
    ticket.save(
        update_fields=[
            "status",
            "resolution_summary",
            "resolved_at",
            "resolved_by",
            "closed_at",
            "closed_by",
            "updated_at",
        ]
    )
    _log_event(
        ticket=ticket,
        event_type=SupportTicketEventType.STATUS_CHANGED,
        actor=performed_by,
        payload={"from": prev, "to": SupportTicketStatus.REJECTED, "reason": text[:300]},
    )
    return ticket


@transaction.atomic
def reopen_ticket(
    *,
    ticket: SupportTicket,
    performed_by: User,
    message: str | None = None,
) -> SupportTicket:
    if ticket.status not in {
        SupportTicketStatus.RESOLVED,
        SupportTicketStatus.CLOSED,
        SupportTicketStatus.REJECTED,
    }:
        raise ValueError("Only resolved, closed, or rejected tickets can be reopened.")

    prev = ticket.status
    ticket.status = SupportTicketStatus.REOPENED
    ticket.resolved_at = None
    ticket.resolved_by = None
    ticket.closed_at = None
    ticket.closed_by = None
    ticket.save(
        update_fields=[
            "status",
            "resolved_at",
            "resolved_by",
            "closed_at",
            "closed_by",
            "updated_at",
        ]
    )
    _log_event(
        ticket=ticket,
        event_type=SupportTicketEventType.REOPENED,
        actor=performed_by,
        payload={"previous_status": prev, "message": (message or "")[:500]},
    )
    if message and _normalize(message):
        SupportTicketComment.objects.create(
            ticket=ticket,
            author=performed_by,
            body=_normalize(message),
            is_internal=False,
        )
    return ticket


def build_ticket_timeline(
    *,
    ticket: SupportTicket,
    include_internal: bool,
    include_internal_events: bool = True,
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    ev_qs = ticket.events.exclude(event_type=SupportTicketEventType.COMMENTED).order_by("created_at", "id")
    if not include_internal_events:
        ev_qs = ev_qs.exclude(event_type=SupportTicketEventType.INTERNAL_NOTE_ADDED)
    for ev in ev_qs:
        items.append(
            {
                "kind": "event",
                "at": ev.created_at.isoformat(),
                "event_type": ev.event_type,
                "actor_id": ev.actor_id,
                "payload": ev.payload,
            }
        )
    comments = ticket.comments.order_by("created_at", "id")
    if not include_internal:
        comments = comments.filter(is_internal=False)
    for c in comments:
        items.append(
            {
                "kind": "comment",
                "at": c.created_at.isoformat(),
                "comment_id": c.id,
                "is_internal": c.is_internal,
                "author_id": c.author_id,
                "body": c.body,
            }
        )
    items.sort(key=lambda x: x["at"])
    return items


def _emi_outstanding_for_subscription(subscription_id: int) -> Decimal | None:
    agg = (
        Emi.objects.filter(subscription_id=subscription_id)
        .exclude(status__in=[EmiStatus.PAID, EmiStatus.WAIVED])
        .aggregate(total=Sum("amount"))
    )
    total = agg.get("total")
    if total is None:
        return Decimal("0.00")
    return Decimal(str(total)).quantize(Decimal("0.01"))


def build_ticket_operational_context(ticket: SupportTicket) -> dict[str, Any]:
    ctx: dict[str, Any] = {
        "customer": None,
        "links": [],
        "outstanding_amount": None,
        "latest_payment": None,
        "subscription_summary": None,
        "direct_sale_summary": None,
        "invoice_reference": None,
    }
    if ticket.customer_id:
        c = ticket.customer
        ctx["customer"] = {
            "id": c.id,
            "name": c.name,
            "phone": c.phone,
        }

    links = list(
        ticket.links.select_related(
            "subscription",
            "subscription__product",
            "payment",
            "emi",
            "direct_sale",
            "billing_invoice",
            "delivery",
            "product",
            "batch",
            "lucky_id",
            "rent_contract",
            "lease_contract",
            "partner",
        )
    )
    sub_id = None
    for link in links:
        entry: dict[str, Any] = {"link_type": link.link_type, "id": link.id}
        if link.subscription_id:
            entry["subscription_id"] = link.subscription_id
            sub_id = link.subscription_id
            entry["plan_type"] = link.subscription.plan_type
            entry["subscription_number"] = getattr(link.subscription, "subscription_number", None)
        if link.payment_id:
            entry["payment_id"] = link.payment_id
            entry["payment_reference"] = getattr(link.payment, "reference_no", None)
        if link.emi_id:
            entry["emi_id"] = link.emi_id
        if link.direct_sale_id:
            entry["direct_sale_id"] = link.direct_sale_id
            entry["direct_sale_no"] = getattr(link.direct_sale, "sale_no", None)
        if link.billing_invoice_id:
            entry["billing_invoice_id"] = link.billing_invoice_id
            entry["document_no"] = getattr(link.billing_invoice, "document_no", None)
        if link.delivery_id:
            entry["delivery_id"] = link.delivery_id
        ctx["links"].append(entry)

    if sub_id:
        sub = Subscription.objects.filter(pk=sub_id).select_related("product", "batch", "lucky_id").first()
        if sub:
            ctx["subscription_summary"] = {
                "id": sub.id,
                "plan_type": sub.plan_type,
                "status": sub.status,
                "product_name": sub.product.name if sub.product_id else None,
                "batch_code": sub.batch.batch_code if sub.batch_id else None,
                "lucky_number": sub.lucky_id.lucky_number if sub.lucky_id_id else None,
            }
            if sub.plan_type == PlanType.EMI:
                ctx["outstanding_amount"] = str(_emi_outstanding_for_subscription(sub.id))
            lp = (
                Payment.objects.filter(subscription_id=sub.id)
                .order_by("-payment_date", "-id")
                .first()
            )
            if lp:
                ctx["latest_payment"] = {
                    "id": lp.id,
                    "amount": str(lp.amount),
                    "payment_date": str(lp.payment_date),
                    "reference_no": lp.reference_no,
                }

    if not ctx["latest_payment"] and ticket.customer_id:
        lp = (
            Payment.objects.filter(customer_id=ticket.customer_id)
            .order_by("-payment_date", "-id")
            .first()
        )
        if lp:
            ctx["latest_payment"] = {
                "id": lp.id,
                "amount": str(lp.amount),
                "payment_date": str(lp.payment_date),
                "reference_no": lp.reference_no,
            }

    ds_link = next((L for L in links if L.direct_sale_id), None)
    if ds_link and ds_link.direct_sale:
        d = ds_link.direct_sale
        ctx["direct_sale_summary"] = {
            "id": d.id,
            "sale_no": getattr(d, "sale_no", None),
            "status": getattr(d, "status", None),
        }

    inv_link = next((L for L in links if L.billing_invoice_id), None)
    if inv_link and inv_link.billing_invoice:
        inv = inv_link.billing_invoice
        ctx["invoice_reference"] = {
            "id": inv.id,
            "document_no": inv.document_no,
        }

    return ctx


def support_ticket_dashboard_summary(queryset):
    from django.db.models import Count

    base = queryset
    total = base.count()
    by_status = dict(base.values("status").annotate(c=Count("id")).values_list("status", "c"))
    by_priority = dict(base.values("priority").annotate(c=Count("id")).values_list("priority", "c"))
    return {
        "total": total,
        "by_status": by_status,
        "by_priority": by_priority,
        "open": by_status.get(SupportTicketStatus.OPEN, 0)
        + by_status.get(SupportTicketStatus.ACKNOWLEDGED, 0)
        + by_status.get(SupportTicketStatus.IN_REVIEW, 0)
        + by_status.get(SupportTicketStatus.WAITING_FOR_CUSTOMER, 0)
        + by_status.get(SupportTicketStatus.WAITING_FOR_INTERNAL_ACTION, 0)
        + by_status.get(SupportTicketStatus.REOPENED, 0),
    }
