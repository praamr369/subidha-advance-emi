from __future__ import annotations

from typing import Any

from django.db.models import Q
from django.utils import timezone

from accounts.models import User
from accounting.models import EmployeeProfile, Vendor
from branch_control.services.context_service import (
    resolve_delivery_branch,
    resolve_direct_sale_branch,
    resolve_invoice_branch,
    resolve_receipt_branch,
    resolve_service_case_branch,
    resolve_subscription_branch,
    resolve_support_request_branch,
    serialize_branch,
)
from accounting.models import CustomerOpeningOutstanding
from billing.models import BillingInvoice, DirectSale, ReceiptDocument
from crm.models import PartyInteraction, PartyLink, PartyLinkRole, PartyMaster
from reminders.models import PaymentReminder
from service_desk.models import ServiceDeskCase, ServiceDeskCaseType
from subscriptions.models import Customer, CustomerSupportRequest, PublicLead, Subscription, SubscriptionDelivery
from subscriptions.models import Payment


def _dt(value):
    if value is None:
        return ""
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _timeline_item(*, event_at, event_type: str, label: str, status: str = "", reference: str = "", detail: str = "", link: dict | None = None, branch=None) -> dict[str, Any]:
    return {
        "event_at": _dt(event_at),
        "event_type": event_type,
        "label": label,
        "status": status,
        "reference": reference,
        "detail": detail,
        "link": link or {},
        **serialize_branch(branch),
    }


def _follow_up_state(next_follow_up_at):
    if next_follow_up_at is None:
        return "NONE"
    now = timezone.now()
    if next_follow_up_at <= now:
        return "DUE"
    return "SCHEDULED"


def build_party_detail_payload(party: PartyMaster) -> dict[str, Any]:
    links = list(party.links.order_by("role_type", "source_pk"))
    role_to_ids: dict[str, list[int]] = {}
    for link in links:
        role_to_ids.setdefault(link.role_type, []).append(link.source_pk)

    leads = list(
        PublicLead.objects.filter(id__in=role_to_ids.get(PartyLinkRole.LEAD, []))
        .select_related("product", "assigned_to", "converted_customer", "converted_subscription", "converted_direct_sale")
        .order_by("-created_at", "-id")
    )
    customers = list(
        Customer.objects.filter(id__in=role_to_ids.get(PartyLinkRole.CUSTOMER, []))
        .select_related("user")
        .order_by("-created_at", "-id")
    )
    partners = list(
        User.objects.filter(id__in=role_to_ids.get(PartyLinkRole.PARTNER, [])).order_by("id")
    )
    vendors = list(Vendor.objects.filter(id__in=role_to_ids.get(PartyLinkRole.VENDOR, [])).order_by("-created_at", "-id"))
    staff = list(
        EmployeeProfile.objects.filter(id__in=role_to_ids.get(PartyLinkRole.STAFF, []))
        .order_by("-created_at", "-id")
    )

    customer_ids = [customer.id for customer in customers]
    partner_ids = [partner.id for partner in partners]
    lead_direct_sale_ids = [lead.converted_direct_sale_id for lead in leads if lead.converted_direct_sale_id]
    lead_subscription_ids = [lead.converted_subscription_id for lead in leads if lead.converted_subscription_id]

    subscriptions = list(
        Subscription.objects.select_related("customer", "product", "batch", "partner", "branch")
        .filter(
            Q(customer_id__in=customer_ids)
            | Q(partner_id__in=partner_ids)
            | Q(id__in=lead_subscription_ids)
        )
        .distinct()
        .order_by("-created_at", "-id")
    )
    subscription_ids = [subscription.id for subscription in subscriptions]

    direct_sales = list(
        DirectSale.objects.select_related("customer", "branch", "cash_counter")
        .filter(
            Q(customer_id__in=customer_ids)
            | Q(id__in=lead_direct_sale_ids)
            | Q(
                customer_name_snapshot__iexact=party.display_name,
                customer_phone_snapshot=party.primary_phone,
            )
        )
        .distinct()
        .order_by("-sale_date", "-id")
    )
    direct_sale_ids = [sale.id for sale in direct_sales]

    invoices = list(
        BillingInvoice.objects.select_related("customer", "subscription", "subscription__branch", "direct_sale", "direct_sale__branch", "branch")
        .filter(
            Q(customer_id__in=customer_ids)
            | Q(subscription_id__in=subscription_ids)
            | Q(direct_sale_id__in=direct_sale_ids)
        )
        .distinct()
        .order_by("-invoice_date", "-id")
    )
    receipts = list(
        ReceiptDocument.objects.select_related("customer", "billing_invoice", "billing_invoice__branch", "direct_sale", "direct_sale__branch", "payment", "payment__branch", "subscription", "subscription__branch", "branch")
        .filter(
            Q(customer_id__in=customer_ids)
            | Q(subscription_id__in=subscription_ids)
            | Q(direct_sale_id__in=direct_sale_ids)
        )
        .distinct()
        .order_by("-receipt_date", "-id")
    )
    payments = list(
        Payment.objects.select_related("customer", "subscription", "subscription__branch", "emi", "branch")
        .filter(
            Q(customer_id__in=customer_ids)
            | Q(subscription_id__in=subscription_ids)
        )
        .distinct()
        .order_by("-payment_date", "-id")
    )
    deliveries = list(
        SubscriptionDelivery.objects.select_related("subscription", "subscription__customer", "subscription__branch")
        .filter(subscription_id__in=subscription_ids)
        .order_by("-created_at", "-id")
    )
    support_requests = list(
        CustomerSupportRequest.objects.select_related("customer", "subscription", "subscription__branch", "payment", "payment__branch")
        .filter(customer_id__in=customer_ids)
        .order_by("-created_at", "-id")
    )
    service_cases = list(
        ServiceDeskCase.objects.select_related(
            "party",
            "support_request",
            "direct_sale",
            "subscription",
            "delivery",
            "billing_invoice",
            "credit_note",
            "debit_note",
            "replacement_direct_sale",
        )
        .filter(
            Q(party_id=party.id)
            | Q(support_request__customer_id__in=customer_ids)
            | Q(subscription_id__in=subscription_ids)
            | Q(direct_sale_id__in=direct_sale_ids)
            | Q(delivery__subscription_id__in=subscription_ids)
            | Q(billing_invoice__subscription_id__in=subscription_ids)
            | Q(billing_invoice__direct_sale_id__in=direct_sale_ids)
        )
        .distinct()
        .order_by("-created_at", "-id")
    )
    return_cases = [
        item
        for item in service_cases
        if item.case_type in {
            ServiceDeskCaseType.SALES_RETURN,
            ServiceDeskCaseType.DELIVERY_RETURN,
            ServiceDeskCaseType.EXCHANGE,
        }
    ]
    service_tickets = [item for item in service_cases if item.case_type == ServiceDeskCaseType.SERVICE]
    complaint_cases = [item for item in service_cases if item.case_type == ServiceDeskCaseType.COMPLAINT]
    reminder_ids_from_interactions = [
        interaction.reminder_id
        for interaction in party.interactions.select_related("reminder").all()
        if interaction.reminder_id
    ]
    reminders = list(
        PaymentReminder.objects.select_related("target_customer", "target_subscription", "target_invoice", "target_payment")
        .filter(
            Q(target_customer_id__in=customer_ids)
            | Q(id__in=reminder_ids_from_interactions)
        )
        .distinct()
        .order_by("-created_at", "-id")
    )
    interactions = list(
        party.interactions.select_related("created_by", "reminder").order_by("-happened_at", "-created_at", "-id")
    )

    legacy_outstandings = list(
        CustomerOpeningOutstanding.objects.filter(customer_id__in=customer_ids)
        .order_by("-entry_date", "-id")
    ) if customer_ids else []

    timeline: list[dict[str, Any]] = []
    for interaction in interactions:
        timeline.append(
            _timeline_item(
                event_at=interaction.happened_at,
                event_type="INTERACTION",
                label=interaction.subject or interaction.interaction_type.replace("_", " "),
                status=interaction.status,
                reference=f"Interaction #{interaction.id}",
                detail=interaction.note,
                link={"interaction_id": interaction.id},
            )
        )
    for lead in leads:
        timeline.append(
            _timeline_item(
                event_at=lead.created_at,
                event_type="LEAD",
                label=lead.name,
                status=lead.status,
                reference=f"Lead #{lead.id}",
                detail=lead.interested_product or lead.notes,
                link={"lead_id": lead.id},
            )
        )
    for subscription in subscriptions:
        timeline.append(
            _timeline_item(
                event_at=subscription.created_at,
                event_type="SUBSCRIPTION",
                label=subscription.contract_reference or f"Subscription #{subscription.id}",
                status=subscription.status,
                reference=f"Subscription #{subscription.id}",
                detail=getattr(subscription.product, "name", ""),
                link={"subscription_id": subscription.id},
                branch=resolve_subscription_branch(subscription),
            )
        )
    for sale in direct_sales:
        timeline.append(
            _timeline_item(
                event_at=sale.created_at,
                event_type="DIRECT_SALE",
                label=sale.sale_no or f"Sale #{sale.id}",
                status=sale.status,
                reference=sale.sale_no or f"Sale #{sale.id}",
                detail=sale.customer_name_snapshot or getattr(sale.customer, "name", ""),
                link={"direct_sale_id": sale.id},
                branch=resolve_direct_sale_branch(sale),
            )
        )
    for invoice in invoices:
        timeline.append(
            _timeline_item(
                event_at=invoice.created_at,
                event_type="INVOICE",
                label=invoice.document_no or f"Invoice #{invoice.id}",
                status=invoice.status,
                reference=invoice.document_no or f"Invoice #{invoice.id}",
                detail=invoice.customer_name_snapshot or getattr(invoice.customer, "name", ""),
                link={"billing_invoice_id": invoice.id},
                branch=resolve_invoice_branch(invoice),
            )
        )
    for receipt in receipts:
        timeline.append(
            _timeline_item(
                event_at=receipt.created_at,
                event_type="RECEIPT",
                label=receipt.receipt_no or f"Receipt #{receipt.id}",
                status=receipt.status,
                reference=receipt.receipt_no or f"Receipt #{receipt.id}",
                detail=receipt.customer_name_snapshot or "",
                link={"receipt_id": receipt.id},
                branch=resolve_receipt_branch(receipt),
            )
        )
    for payment in payments:
        timeline.append(
            _timeline_item(
                event_at=payment.created_at,
                event_type="PAYMENT",
                label=payment.reference_no or f"Payment #{payment.id}",
                status="RECORDED",
                reference=payment.reference_no or f"Payment #{payment.id}",
                detail=f"{payment.amount} {payment.method}",
                link={"payment_id": payment.id, "subscription_id": payment.subscription_id},
                branch=payment.branch,
            )
        )
    for delivery in deliveries:
        timeline.append(
            _timeline_item(
                event_at=delivery.created_at,
                event_type="DELIVERY",
                label=delivery.delivery_reference,
                status=delivery.status,
                reference=delivery.delivery_reference,
                detail=delivery.receiver_name or delivery.receiver_phone,
                link={"delivery_id": delivery.id, "subscription_id": delivery.subscription_id},
                branch=resolve_delivery_branch(delivery),
            )
        )
    for support_request in support_requests:
        timeline.append(
            _timeline_item(
                event_at=support_request.created_at,
                event_type="SUPPORT",
                label=f"Support #{support_request.id}",
                status=support_request.status,
                reference=f"Support #{support_request.id}",
                detail=support_request.category,
                link={"support_request_id": support_request.id},
                branch=resolve_support_request_branch(support_request),
            )
        )
    for service_case in service_cases:
        timeline.append(
            _timeline_item(
                event_at=service_case.created_at,
                event_type=service_case.case_type,
                label=service_case.case_no,
                status=service_case.status,
                reference=service_case.case_no,
                detail=service_case.issue_summary,
                link={"service_case_id": service_case.id},
                branch=resolve_service_case_branch(service_case),
            )
        )
    for reminder in reminders:
        timeline.append(
            _timeline_item(
                event_at=reminder.created_at,
                event_type="REMINDER",
                label=reminder.reminder_no,
                status=reminder.status,
                reference=reminder.reminder_no,
                detail=reminder.reminder_type,
                link={"reminder_id": reminder.id},
            )
        )
    for lo in legacy_outstandings:
        timeline.append(
            _timeline_item(
                event_at=lo.entry_date,
                event_type="LEGACY_OUTSTANDING",
                label=f"Opening Balance — {lo.customer_name}",
                status="SETTLED" if lo.is_settled else "DUE",
                reference=f"Legacy #{lo.id}",
                detail=f"₹{lo.outstanding_amount} (paid ₹{lo.collected_amount}, remaining ₹{lo.balance_remaining})",
                link={"legacy_outstanding_id": lo.id},
            )
        )
    timeline.sort(key=lambda item: item["event_at"], reverse=True)

    open_follow_ups = sorted(
        [
            interaction
            for interaction in interactions
            if interaction.status == "OPEN" and interaction.next_follow_up_at
        ],
        key=lambda interaction: interaction.next_follow_up_at,
    )
    next_follow_up_at = open_follow_ups[0].next_follow_up_at if open_follow_ups else None

    # ------------------------------------------------------------------
    # Operational rollups: financial position + urgency alerts, derived
    # purely from the lists already fetched above (no extra queries). These
    # let an operator see at a glance what needs action on this party.
    # ------------------------------------------------------------------
    from decimal import Decimal

    def _dec(value) -> Decimal:
        try:
            return Decimal(str(value or 0))
        except Exception:  # noqa: BLE001 - defensive against bad data
            return Decimal("0")

    # Cancelled / void / draft documents are not real receivables.
    _void_invoice = {"CANCELLED", "VOID", "DRAFT", "REVERSED"}
    _void_sale = {"CANCELLED", "VOID", "DRAFT"}
    billable_invoices = [inv for inv in invoices if inv.status not in _void_invoice]
    total_invoiced = sum((_dec(inv.grand_total) for inv in billable_invoices), Decimal("0"))
    total_received = sum((_dec(rcpt.amount) for rcpt in receipts), Decimal("0"))
    outstanding = total_invoiced - total_received
    if outstanding < 0:
        outstanding = Decimal("0")
    legacy_outstanding_total = sum(
        (o.balance_remaining for o in legacy_outstandings if not o.is_settled),
        Decimal("0"),
    )
    outstanding += legacy_outstanding_total
    total_direct_sales = sum(
        (_dec(sale.grand_total) for sale in direct_sales if sale.status not in _void_sale),
        Decimal("0"),
    )

    today = timezone.now().date()
    _delivery_done = {"DELIVERED", "CANCELLED", "RETURNED"}
    _delivery_urgent = {"FAILED", "BLOCKED_STOCK_UNAVAILABLE", "RETURN_REQUESTED"}
    _service_done = {"RESOLVED", "CLOSED", "REJECTED"}
    _support_done = {"RESOLVED", "CLOSED", "CANCELLED"}

    pending_deliveries = [d for d in deliveries if d.status not in _delivery_done]
    urgent_deliveries = [d for d in deliveries if d.status in _delivery_urgent]
    open_service_cases = [c for c in service_cases if c.status not in _service_done]
    open_support = [s for s in support_requests if getattr(s, "status", "") not in _support_done]
    due_reminders = [
        r for r in reminders
        if r.status == "PENDING" and r.due_date and r.due_date <= today
    ]
    pending_kyc_customers = [c for c in customers if getattr(c, "kyc_status", "") == "PENDING"]

    alerts: list[dict[str, Any]] = []
    if legacy_outstanding_total > 0:
        unsettled = [o for o in legacy_outstandings if not o.is_settled]
        alerts.append({
            "level": "high",
            "module": "LEGACY",
            "label": "Legacy outstanding (old books)",
            "detail": f"₹{legacy_outstanding_total} from {len(unsettled)} migrated opening balance(s)",
            "count": len(unsettled),
            "amount": str(legacy_outstanding_total),
        })
    if outstanding > 0:
        alerts.append({
            "level": "high",
            "module": "BILLING",
            "label": "Outstanding balance",
            "detail": f"₹{outstanding} unpaid (includes legacy + invoices)",
            "count": None,
            "amount": str(outstanding),
        })
    if urgent_deliveries:
        alerts.append({
            "level": "high",
            "module": "DELIVERY",
            "label": "Deliveries need attention",
            "detail": f"{len(urgent_deliveries)} failed/blocked, {len(pending_deliveries)} pending in total",
            "count": len(urgent_deliveries),
            "amount": None,
        })
    elif pending_deliveries:
        alerts.append({
            "level": "medium",
            "module": "DELIVERY",
            "label": "Deliveries pending",
            "detail": f"{len(pending_deliveries)} awaiting dispatch/handover",
            "count": len(pending_deliveries),
            "amount": None,
        })
    if pending_kyc_customers:
        alerts.append({
            "level": "high",
            "module": "KYC",
            "label": "KYC pending",
            "detail": f"{len(pending_kyc_customers)} linked customer(s) awaiting verification",
            "count": len(pending_kyc_customers),
            "amount": None,
        })
    if open_service_cases:
        alerts.append({
            "level": "medium",
            "module": "SERVICE",
            "label": "Open service cases",
            "detail": f"{len(open_service_cases)} unresolved",
            "count": len(open_service_cases),
            "amount": None,
        })
    if open_support:
        alerts.append({
            "level": "medium",
            "module": "SUPPORT",
            "label": "Open support requests",
            "detail": f"{len(open_support)} awaiting response",
            "count": len(open_support),
            "amount": None,
        })
    if due_reminders:
        alerts.append({
            "level": "medium",
            "module": "REMINDER",
            "label": "Reminders due",
            "detail": f"{len(due_reminders)} due on/before today",
            "count": len(due_reminders),
            "amount": None,
        })
    if len(open_follow_ups) > 0:
        alerts.append({
            "level": "info",
            "module": "CRM",
            "label": "Open follow-ups",
            "detail": f"{len(open_follow_ups)} scheduled",
            "count": len(open_follow_ups),
            "amount": None,
        })

    _alert_rank = {"high": 0, "medium": 1, "info": 2}
    alerts.sort(key=lambda a: _alert_rank.get(a["level"], 3))

    return {
        "party": {
            "id": party.id,
            "party_no": party.party_no,
            "display_name": party.display_name,
            "party_kind": party.party_kind,
            "primary_phone": party.primary_phone,
            "primary_email": party.primary_email,
            "city": party.city,
            "notes_summary": party.notes_summary,
            "is_active": party.is_active,
            "role_types": sorted({link.role_type for link in links}),
            "next_follow_up_at": _dt(next_follow_up_at),
            "follow_up_state": _follow_up_state(next_follow_up_at),
        },
        "links": [
            {
                "id": link.id,
                "role_type": link.role_type,
                "source_model": link.source_model,
                "source_pk": link.source_pk,
                "source_reference": link.source_reference,
                "metadata": link.metadata,
            }
            for link in links
        ],
        "summary": {
            "lead_count": len(leads),
            "open_lead_count": len([l for l in leads if getattr(l, "status", "") in ("NEW", "IN_PROGRESS", "CONTACTED")]),
            "customer_count": len(customers),
            "partner_count": len(partners),
            "vendor_count": len(vendors),
            "staff_count": len(staff),
            "subscription_count": len(subscriptions),
            "direct_sale_count": len(direct_sales),
            "invoice_count": len(invoices),
            "receipt_count": len(receipts),
            "payment_count": len(payments),
            "delivery_count": len(deliveries),
            "support_count": len(support_requests),
            "service_case_count": len(service_cases),
            "return_case_count": len(return_cases),
            "service_ticket_count": len(service_tickets),
            "complaint_case_count": len(complaint_cases),
            "reminder_count": len(reminders),
            "interaction_count": len(interactions),
            "open_follow_up_count": len([item for item in interactions if item.status == "OPEN"]),
            "pending_delivery_count": len(pending_deliveries),
            "urgent_delivery_count": len(urgent_deliveries),
            "open_service_case_count": len(open_service_cases),
            "open_support_count": len(open_support),
            "due_reminder_count": len(due_reminders),
            "pending_kyc_count": len(pending_kyc_customers),
            "legacy_outstanding_count": len(legacy_outstandings),
            "unsettled_legacy_count": len([o for o in legacy_outstandings if not o.is_settled]),
        },
        "financials": {
            "total_invoiced": str(total_invoiced),
            "total_received": str(total_received),
            "outstanding": str(outstanding),
            "legacy_outstanding": str(legacy_outstanding_total),
            "total_direct_sales": str(total_direct_sales),
        },
        "alerts": alerts,
        "related": {
            "leads": [
                {
                    "id": lead.id,
                    "name": lead.name,
                    "phone": lead.phone,
                    "status": lead.status,
                    "product_name": getattr(lead.product, "name", None),
                    "converted_customer_id": lead.converted_customer_id,
                    "converted_subscription_id": lead.converted_subscription_id,
                    "converted_direct_sale_id": lead.converted_direct_sale_id,
                    "created_at": _dt(lead.created_at),
                }
                for lead in leads
            ],
            "customers": [
                {
                    "id": customer.id,
                    "name": customer.name,
                    "phone": customer.phone,
                    "city": customer.city,
                    "kyc_status": customer.kyc_status,
                    "created_at": _dt(customer.created_at),
                }
                for customer in customers
            ],
            "partners": [
                {
                    "id": partner.id,
                    "username": partner.username,
                    "phone": partner.phone,
                    "email": partner.email,
                    "is_active": partner.is_active,
                }
                for partner in partners
            ],
            "vendors": [
                {
                    "id": vendor.id,
                    "name": vendor.name,
                    "phone": vendor.phone,
                    "email": vendor.email,
                    "is_active": vendor.is_active,
                }
                for vendor in vendors
            ],
            "staff": [
                {
                    "id": employee.id,
                    "employee_code": employee.employee_code,
                    "name": employee.name,
                    "phone": employee.phone,
                    "department": employee.department,
                    "designation": employee.designation,
                    "is_active": employee.is_active,
                }
                for employee in staff
            ],
            "subscriptions": [
                {
                    "id": subscription.id,
                    "contract_reference": subscription.contract_reference,
                    "status": subscription.status,
                    "customer_id": subscription.customer_id,
                    "partner_id": subscription.partner_id,
                    "product_name": getattr(subscription.product, "name", ""),
                    "total_amount": str(subscription.total_amount),
                    "monthly_amount": str(subscription.monthly_amount),
                    **serialize_branch(resolve_subscription_branch(subscription)),
                    "created_at": _dt(subscription.created_at),
                }
                for subscription in subscriptions[:25]
            ],
            "direct_sales": [
                {
                    "id": sale.id,
                    "sale_no": sale.sale_no,
                    "status": sale.status,
                    "customer_id": sale.customer_id,
                    "grand_total": str(sale.grand_total),
                    "sale_date": str(sale.sale_date),
                    **serialize_branch(resolve_direct_sale_branch(sale)),
                    "created_at": _dt(sale.created_at),
                }
                for sale in direct_sales[:25]
            ],
            "invoices": [
                {
                    "id": invoice.id,
                    "document_no": invoice.document_no,
                    "status": invoice.status,
                    "customer_id": invoice.customer_id,
                    "subscription_id": invoice.subscription_id,
                    "direct_sale_id": invoice.direct_sale_id,
                    "grand_total": str(invoice.grand_total),
                    "invoice_date": str(invoice.invoice_date),
                    **serialize_branch(resolve_invoice_branch(invoice)),
                    "created_at": _dt(invoice.created_at),
                }
                for invoice in invoices[:25]
            ],
            "receipts": [
                {
                    "id": receipt.id,
                    "receipt_no": receipt.receipt_no,
                    "status": receipt.status,
                    "amount": str(receipt.amount),
                    "billing_invoice_id": receipt.billing_invoice_id,
                    "direct_sale_id": receipt.direct_sale_id,
                    "receipt_date": str(receipt.receipt_date),
                    **serialize_branch(resolve_receipt_branch(receipt)),
                    "created_at": _dt(receipt.created_at),
                }
                for receipt in receipts[:25]
            ],
            "payments": [
                {
                    "id": payment.id,
                    "reference_no": payment.reference_no,
                    "method": payment.method,
                    "amount": str(payment.amount),
                    "subscription_id": payment.subscription_id,
                    "emi_id": payment.emi_id,
                    "payment_date": str(payment.payment_date),
                    **serialize_branch(payment.branch),
                    "created_at": _dt(payment.created_at),
                }
                for payment in payments[:25]
            ],
            "deliveries": [
                {
                    "id": delivery.id,
                    "delivery_reference": delivery.delivery_reference,
                    "status": delivery.status,
                    "subscription_id": delivery.subscription_id,
                    "scheduled_date": str(delivery.scheduled_date) if delivery.scheduled_date else None,
                    **serialize_branch(resolve_delivery_branch(delivery)),
                    "created_at": _dt(delivery.created_at),
                }
                for delivery in deliveries[:25]
            ],
            "support_requests": [
                {
                    "id": support_request.id,
                    "status": support_request.status,
                    "category": support_request.category,
                    "subscription_id": support_request.subscription_id,
                    "payment_id": support_request.payment_id,
                    **serialize_branch(resolve_support_request_branch(support_request)),
                    "created_at": _dt(support_request.created_at),
                }
                for support_request in support_requests[:25]
            ],
            "service_cases": [
                {
                    "id": service_case.id,
                    "case_no": service_case.case_no,
                    "case_type": service_case.case_type,
                    "status": service_case.status,
                    "support_request_id": service_case.support_request_id,
                    "direct_sale_id": service_case.direct_sale_id,
                    "subscription_id": service_case.subscription_id,
                    "delivery_id": service_case.delivery_id,
                    "billing_invoice_id": service_case.billing_invoice_id,
                    "credit_note_id": service_case.credit_note_id,
                    "debit_note_id": service_case.debit_note_id,
                    "replacement_direct_sale_id": service_case.replacement_direct_sale_id,
                    "issue_summary": service_case.issue_summary,
                    "total_amount": str(service_case.total_amount),
                    **serialize_branch(resolve_service_case_branch(service_case)),
                    "created_at": _dt(service_case.created_at),
                }
                for service_case in service_cases[:25]
            ],
            "return_cases": [
                {
                    "id": service_case.id,
                    "case_no": service_case.case_no,
                    "case_type": service_case.case_type,
                    "status": service_case.status,
                    "billing_invoice_id": service_case.billing_invoice_id,
                    "credit_note_id": service_case.credit_note_id,
                    "replacement_direct_sale_id": service_case.replacement_direct_sale_id,
                    "issue_summary": service_case.issue_summary,
                    "created_at": _dt(service_case.created_at),
                }
                for service_case in return_cases[:25]
            ],
            "service_tickets": [
                {
                    "id": service_case.id,
                    "case_no": service_case.case_no,
                    "status": service_case.status,
                    "warranty_status": service_case.warranty_status,
                    "debit_note_id": service_case.debit_note_id,
                    "issue_summary": service_case.issue_summary,
                    "created_at": _dt(service_case.created_at),
                }
                for service_case in service_tickets[:25]
            ],
            "complaint_cases": [
                {
                    "id": service_case.id,
                    "case_no": service_case.case_no,
                    "status": service_case.status,
                    "support_request_id": service_case.support_request_id,
                    "issue_summary": service_case.issue_summary,
                    "created_at": _dt(service_case.created_at),
                }
                for service_case in complaint_cases[:25]
            ],
            "reminders": [
                {
                    "id": reminder.id,
                    "reminder_no": reminder.reminder_no,
                    "status": reminder.status,
                    "reminder_type": reminder.reminder_type,
                    "due_date": str(reminder.due_date),
                    "scheduled_for": _dt(reminder.scheduled_for),
                    "created_at": _dt(reminder.created_at),
                }
                for reminder in reminders[:25]
            ],
            "interactions": [
                {
                    "id": interaction.id,
                    "interaction_type": interaction.interaction_type,
                    "status": interaction.status,
                    "subject": interaction.subject,
                    "note": interaction.note,
                    "happened_at": _dt(interaction.happened_at),
                    "next_follow_up_at": _dt(interaction.next_follow_up_at),
                    "created_by_username": getattr(interaction.created_by, "username", None),
                    "reminder_id": interaction.reminder_id,
                }
                for interaction in interactions[:50]
            ],
            "legacy_outstandings": [
                {
                    "id": lo.id,
                    "customer_name": lo.customer_name,
                    "phone": lo.phone,
                    "outstanding_amount": str(lo.outstanding_amount),
                    "collected_amount": str(lo.collected_amount),
                    "balance_remaining": str(lo.balance_remaining),
                    "entry_date": str(lo.entry_date),
                    "is_settled": lo.is_settled,
                    "admin_verified": lo.admin_verified,
                    "notes": lo.notes,
                }
                for lo in legacy_outstandings
            ],
        },
        "timeline": timeline[:100],
    }
