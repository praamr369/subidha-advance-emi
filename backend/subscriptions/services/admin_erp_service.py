from __future__ import annotations

from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Count, Q, Sum
from django.utils import timezone

from billing.models import BillingInvoice, DirectSale, ReceiptDocument
from crm.models import PartyInteraction, PartyInteractionStatus
from inventory.models import InventoryItem, StockLedger, StockMovementType
from service_desk.models import ServiceDeskCase, ServiceDeskCaseStatus
from subscriptions.models import (
    Batch,
    Customer,
    CustomerKycDocument,
    CustomerKycDocumentStatus,
    CustomerSupportRequest,
    DeliveryStatus,
    Emi,
    EmiStatus,
    LuckyId,
    PartnerCollectionRequest,
    PartnerCollectionRequestStatus,
    Payment,
    PaymentReconciliation,
    ReconciliationStatus,
    RentLeaseReturnInspection,
    SubscriptionDelivery,
    Subscription,
    SubscriptionRequest,
    SubscriptionRequestStatus,
)


def _severity_for_count(count: int) -> str:
    if count <= 0:
        return "LOW"
    if count < 5:
        return "MEDIUM"
    return "HIGH"


def _queue_card(key: str, label: str, count: int, source: str, deep_link: str, value: str | None = None) -> dict:
    return {
        "key": key,
        "label": label,
        "count": count,
        "value": value,
        "severity": _severity_for_count(count),
        "source": source,
        "deep_link": deep_link,
        "empty_state": "No pending records." if count == 0 else None,
    }


def _sum_decimal(queryset, field: str) -> Decimal:
    return Decimal(str(queryset.aggregate(total=Sum(field)).get("total") or "0"))


def _monthly_amount_series() -> list[dict]:
    today = timezone.localdate()
    month_buckets = []
    for offset in range(5, -1, -1):
        marker = (today.replace(day=1) - timedelta(days=offset * 30))
        month_buckets.append((marker.year, marker.month))

    collection_map = defaultdict(lambda: Decimal("0"))
    rows = (
        Payment.objects.filter(payment_date__isnull=False)
        .values("payment_date__year", "payment_date__month")
        .annotate(total=Sum("amount"))
    )
    for row in rows:
        collection_map[(row["payment_date__year"], row["payment_date__month"])] = Decimal(str(row["total"] or "0"))

    lead_map = defaultdict(int)
    lead_rows = (
        SubscriptionRequest.objects.values("created_at__year", "created_at__month")
        .annotate(total=Count("id"))
    )
    for row in lead_rows:
        lead_map[(row["created_at__year"], row["created_at__month"])] = int(row["total"] or 0)

    results = []
    for year, month in month_buckets:
        results.append(
            {
                "month": f"{year}-{month:02d}",
                "collections": str(collection_map[(year, month)]),
                "requests": lead_map[(year, month)],
            }
        )
    return results


def build_admin_erp_summary() -> dict:
    today = timezone.localdate()
    pending_kyc = CustomerKycDocument.objects.filter(
        status__in=[CustomerKycDocumentStatus.PENDING, CustomerKycDocumentStatus.SUBMITTED]
    )
    pending_partner_requests = PartnerCollectionRequest.objects.filter(
        status=PartnerCollectionRequestStatus.SUBMITTED
    )
    pending_support = CustomerSupportRequest.objects.filter(status__in=["SUBMITTED", "UNDER_REVIEW"])
    due_emis = Emi.objects.filter(status=EmiStatus.PENDING, due_date__lte=today)
    overdue_emis = Emi.objects.filter(status=EmiStatus.PENDING, due_date__lt=today)
    due_deliveries = SubscriptionDelivery.objects.filter(
        status__in=[DeliveryStatus.PENDING, DeliveryStatus.SCHEDULED]
    )
    blocked_deliveries = SubscriptionDelivery.objects.filter(
        status=DeliveryStatus.BLOCKED_STOCK_UNAVAILABLE
    )
    return_due = RentLeaseReturnInspection.objects.filter(status__in=["PENDING", "IN_PROGRESS"])
    return_inspection_pending = return_due

    unreconciled = PaymentReconciliation.objects.filter(
        Q(status=ReconciliationStatus.PENDING) | Q(is_flagged=True)
    )

    direct_sales = DirectSale.objects.all()
    active_contracts = Subscription.objects.filter(status__in=["ACTIVE", "APPROVED", "PENDING_APPROVAL"])

    def _inventory_alert_candidates(query_slice):
        """Safe ERP inventory counts using actual InventoryItem APIs (no guessed math)."""
        low: list[InventoryItem] = []
        out: list[InventoryItem] = []
        for item in query_slice:
            if not item.stock_tracking_enabled:
                continue
            try:
                available = item.available_qty()
            except Exception:
                continue
            if available <= Decimal("0"):
                out.append(item)
            threshold = item.reorder_level_qty
            if threshold > Decimal("0") and available <= threshold:
                low.append(item)
        return low, out

    low_stock, out_of_stock_requested = _inventory_alert_candidates(
        InventoryItem.objects.filter(is_active=True).select_related("product")[:300]
    )

    pending_invoices = BillingInvoice.objects.filter(status="DRAFT")
    unpaid_invoices = BillingInvoice.objects.filter(status="POSTED")
    receipts_today = ReceiptDocument.objects.filter(receipt_date=today)
    payments_today = Payment.objects.filter(payment_date=today)
    rent_deposit_total = _sum_decimal(
        Subscription.objects.filter(plan_type="RENT", rent_profile__isnull=False),
        "rent_profile__security_deposit_amount",
    )
    lease_deposit_total = _sum_decimal(
        Subscription.objects.filter(plan_type="LEASE", lease_profile__isnull=False),
        "lease_profile__security_deposit_amount",
    )
    deposit_held = rent_deposit_total + lease_deposit_total

    crm_new_leads = SubscriptionRequest.objects.filter(status=SubscriptionRequestStatus.SUBMITTED)
    followups_due = PartyInteraction.objects.filter(
        status=PartyInteractionStatus.OPEN,
        next_follow_up_at__isnull=False,
        next_follow_up_at__lte=timezone.now(),
    )
    converted_customers = Customer.objects.filter(subscriptions__isnull=False).distinct()
    inactive_customers = Customer.objects.filter(user__is_active=False)
    support_open = ServiceDeskCase.objects.filter(
        status__in=[
            ServiceDeskCaseStatus.OPEN,
            ServiceDeskCaseStatus.UNDER_REVIEW,
            ServiceDeskCaseStatus.AUTHORIZED,
            ServiceDeskCaseStatus.IN_SERVICE,
        ]
    )

    results = {
        "as_of": timezone.now().isoformat(),
        "today_work": [
            _queue_card(
                key="pending_approvals",
                label="Pending approvals",
                count=active_contracts.filter(status="PENDING_APPROVAL").count(),
                source="subscriptions.Subscription",
                deep_link="/admin/subscriptions",
            ),
            _queue_card(
                key="payments_due",
                label="Payments due",
                count=due_emis.count(),
                source="subscriptions.Emi",
                deep_link="/admin/emis/overdue",
            ),
            _queue_card(
                key="delivery_due",
                label="Delivery due",
                count=due_deliveries.count(),
                source="subscriptions.Subscription",
                deep_link="/admin/deliveries",
            ),
            _queue_card(
                key="return_due",
                label="Return due",
                count=return_due.count(),
                source="subscriptions.RentLeaseReturnInspection",
                deep_link="/admin/service-desk/returns",
            ),
            _queue_card(
                key="kyc_pending",
                label="KYC pending",
                count=pending_kyc.count(),
                source="subscriptions.CustomerKycDocument",
                deep_link="/admin/customers",
            ),
            _queue_card(
                key="partner_requests",
                label="Partner requests",
                count=pending_partner_requests.count(),
                source="subscriptions.PartnerCollectionRequest",
                deep_link="/admin/partner-payment-requests",
            ),
            _queue_card(
                key="support_requests",
                label="Support requests",
                count=pending_support.count() + support_open.count(),
                source="subscriptions.CustomerSupportRequest, service_desk.ServiceDeskCase",
                deep_link="/admin/support-requests",
            ),
        ],
        "business_health": [
            _queue_card(
                key="today_collection",
                label="Today collection",
                count=payments_today.count(),
                value=str(_sum_decimal(payments_today, "amount")),
                source="subscriptions.Payment",
                deep_link="/admin/payments",
            ),
            _queue_card(
                key="pending_dues",
                label="Pending dues",
                count=due_emis.count(),
                value=str(_sum_decimal(due_emis, "amount")),
                source="subscriptions.Emi",
                deep_link="/admin/emis/overdue",
            ),
            _queue_card(
                key="overdue_amount",
                label="Overdue amount",
                count=overdue_emis.count(),
                value=str(_sum_decimal(overdue_emis, "amount")),
                source="subscriptions.Emi",
                deep_link="/admin/emis/overdue",
            ),
            _queue_card(
                key="active_contracts",
                label="Active contracts",
                count=active_contracts.count(),
                source="subscriptions.Subscription",
                deep_link="/admin/subscriptions",
            ),
            _queue_card(
                key="direct_sale_revenue",
                label="Direct sale revenue",
                count=direct_sales.filter(status__in=["CONFIRMED", "DELIVERED", "INVOICED"]).count(),
                value=str(
                    _sum_decimal(
                        direct_sales.filter(status__in=["CONFIRMED", "DELIVERED", "INVOICED"]),
                        "grand_total",
                    )
                ),
                source="billing.DirectSale",
                deep_link="/admin/billing/direct-sale",
            ),
            _queue_card(
                key="rent_lease_deposit_held",
                label="Rent/Lease deposits held",
                count=Subscription.objects.filter(plan_type__in=["RENT", "LEASE"]).count(),
                value=str(deposit_held),
                source="subscriptions.Subscription",
                deep_link="/admin/finance/deposits",
            ),
            _queue_card(
                key="stock_alerts",
                label="Stock alerts",
                count=len(low_stock),
                source="inventory.InventoryItem",
                deep_link="/admin/inventory/stock-on-hand",
            ),
            _queue_card(
                key="unreconciled_payments",
                label="Unreconciled payments",
                count=unreconciled.count(),
                source="subscriptions.PaymentReconciliation",
                deep_link="/admin/reconciliation",
            ),
        ],
        "crm_pipeline": [
            _queue_card(
                key="new_leads",
                label="New leads",
                count=crm_new_leads.count(),
                source="subscriptions.SubscriptionRequest",
                deep_link="/admin/subscription-requests",
            ),
            _queue_card(
                key="followups_due",
                label="Follow-ups due",
                count=followups_due.count(),
                source="crm.PartyInteraction",
                deep_link="/admin/crm",
            ),
            _queue_card(
                key="converted_customers",
                label="Converted customers",
                count=converted_customers.count(),
                source="subscriptions.Customer",
                deep_link="/admin/customers",
            ),
            _queue_card(
                key="pending_kyc",
                label="Pending KYC",
                count=pending_kyc.count(),
                source="subscriptions.CustomerKycDocument",
                deep_link="/admin/customers",
            ),
            _queue_card(
                key="inactive_customers",
                label="Inactive customers",
                count=inactive_customers.count(),
                source="subscriptions.Customer",
                deep_link="/admin/customers",
            ),
            _queue_card(
                key="support_open",
                label="Support open",
                count=support_open.count(),
                source="service_desk.ServiceDeskCase",
                deep_link="/admin/service",
            ),
        ],
        "sales_pipeline": [
            _queue_card(
                key="public_enquiries",
                label="Public enquiries",
                count=crm_new_leads.count(),
                source="subscriptions.SubscriptionRequest",
                deep_link="/admin/leads",
            ),
            _queue_card(
                key="direct_sale_orders",
                label="Direct sale orders",
                count=direct_sales.exclude(status="CANCELLED").count(),
                source="billing.DirectSale",
                deep_link="/admin/billing/direct-sale",
            ),
            _queue_card(
                key="subscription_requests",
                label="Subscription requests",
                count=SubscriptionRequest.objects.count(),
                source="subscriptions.SubscriptionRequest",
                deep_link="/admin/subscription-requests",
            ),
            _queue_card(
                key="rent_lease_requests",
                label="Rent/Lease requests",
                count=SubscriptionRequest.objects.filter(
                    Q(product__is_rent_enabled=True) | Q(product__is_lease_enabled=True)
                ).count(),
                source="subscriptions.SubscriptionRequest",
                deep_link="/admin/subscription-requests",
            ),
            _queue_card(
                key="pending_invoices",
                label="Pending invoices",
                count=pending_invoices.count(),
                source="billing.BillingInvoice",
                deep_link="/admin/billing/invoices",
            ),
            _queue_card(
                key="unpaid_invoices",
                label="Unpaid invoices",
                count=unpaid_invoices.count(),
                source="billing.BillingInvoice",
                deep_link="/admin/billing/invoices",
            ),
        ],
        "operations_pipeline": [
            _queue_card(
                key="stock_required",
                label="Stock required",
                count=len(low_stock),
                source="inventory.InventoryItem",
                deep_link="/admin/inventory/workspace",
            ),
            _queue_card(
                key="delivery_pending",
                label="Delivery pending",
                count=due_deliveries.count(),
                source="subscriptions.Subscription",
                deep_link="/admin/delivery/workspace",
            ),
            _queue_card(
                key="delivery_blocked",
                label="Delivery blocked",
                count=blocked_deliveries.count(),
                source="subscriptions.Subscription",
                deep_link="/admin/delivery/workspace",
            ),
            _queue_card(
                key="return_inspection_pending",
                label="Return inspection pending",
                count=return_inspection_pending.count(),
                source="subscriptions.RentLeaseReturnInspection",
                deep_link="/admin/delivery/workspace",
            ),
            _queue_card(
                key="maintenance_pending",
                label="Maintenance/service pending",
                count=support_open.count(),
                source="service_desk.ServiceDeskCase",
                deep_link="/admin/service",
            ),
        ],
        "charts": {
            "monthly_collection_and_requests": _monthly_amount_series(),
            "kpi_snapshot": {
                "customers": Customer.objects.count(),
                "subscriptions": Subscription.objects.count(),
                "direct_sales": DirectSale.objects.count(),
                "receipts_today": receipts_today.count(),
                "inventory_moves_today": StockLedger.objects.filter(movement_date=today).count(),
                "lucky_ids_assigned": LuckyId.objects.filter(status="ASSIGNED").count(),
                "batches_open": Batch.objects.filter(status="OPEN").count(),
            },
        },
        "quick_actions": [
            {"label": "Create Customer", "href": "/admin/customers/create"},
            {"label": "Create Contract", "href": "/admin/subscriptions/create"},
            {"label": "Create Direct Sale", "href": "/admin/billing/direct-sale?mode=create"},
            {"label": "Collect Payment", "href": "/admin/finance/collect"},
            {"label": "Create Delivery", "href": "/admin/delivery/create"},
            {"label": "Verify KYC", "href": "/admin/customers"},
            {"label": "Reconcile Payment", "href": "/admin/finance/reconciliation"},
            {"label": "View Reports", "href": "/admin/reports"},
        ],
    }
    # Workspace-specific payloads built from authoritative sources only.
    results["sales_workspace"] = {
        "cards": results["sales_pipeline"],
    }
    results["product_workspace"] = {
        "cards": [
            _queue_card("products_total", "Products", InventoryItem.objects.count(), "inventory.InventoryItem", "/admin/products/workspace"),
            _queue_card("low_stock", "Low stock", len(low_stock), "inventory.InventoryItem", "/admin/products/workspace"),
            _queue_card(
                "out_of_stock_requested",
                "Out-of-stock requested products",
                len(out_of_stock_requested),
                "inventory.InventoryItem",
                "/admin/products/workspace",
            ),
            _queue_card(
                "contract_demand",
                "Contract demand",
                SubscriptionRequest.objects.count(),
                "subscriptions.SubscriptionRequest",
                "/admin/subscription-requests",
            ),
            _queue_card(
                "direct_sale_demand",
                "Direct sale demand",
                direct_sales.count(),
                "billing.DirectSale",
                "/admin/billing/direct-sale",
            ),
        ]
    }
    results["inventory_workspace"] = {
        "cards": [
            _queue_card("stock_on_hand", "Stock on hand", InventoryItem.objects.count(), "inventory.InventoryItem", "/admin/inventory/stock-on-hand"),
            _queue_card("reserved_stock", "Reserved stock", StockLedger.objects.filter(movement_type=StockMovementType.SALE_RESERVE).count(), "inventory.StockLedger", "/admin/inventory/ledger"),
            _queue_card("stock_movements", "Stock movement", StockLedger.objects.count(), "inventory.StockLedger", "/admin/inventory/movements"),
            _queue_card(
                "stock_adjustments",
                "Stock adjustment",
                StockLedger.objects.filter(
                    movement_type__in=[
                        StockMovementType.ADJUSTMENT_IN,
                        StockMovementType.ADJUSTMENT_OUT,
                        StockMovementType.STOCK_ADJUSTMENT,
                    ]
                ).count(),
                "inventory.StockLedger",
                "/admin/inventory/adjustments",
            ),
            _queue_card("delivery_blocked_stock", "Delivery-blocked stock", blocked_deliveries.count(), "subscriptions.Subscription", "/admin/delivery/workspace"),
        ]
    }
    results["finance_workspace"] = {
        "cards": [
            _queue_card("collections", "Collections", Payment.objects.count(), "subscriptions.Payment", "/admin/payments"),
            _queue_card("dues", "Dues", due_emis.count(), "subscriptions.Emi", "/admin/emis/overdue"),
            _queue_card("overdue", "Overdue", overdue_emis.count(), "subscriptions.Emi", "/admin/emis/overdue"),
            _queue_card("receipts", "Receipts", ReceiptDocument.objects.count(), "billing.ReceiptDocument", "/admin/billing/receipts"),
            _queue_card("invoices", "Invoices", BillingInvoice.objects.count(), "billing.BillingInvoice", "/admin/billing/invoices"),
            _queue_card("deposits", "Deposits", Subscription.objects.filter(plan_type__in=["RENT", "LEASE"]).count(), "subscriptions.Subscription", "/admin/finance/deposits"),
            _queue_card("reconciliation", "Reconciliation", unreconciled.count(), "subscriptions.PaymentReconciliation", "/admin/reconciliation"),
        ]
    }
    results["delivery_workspace"] = {
        "cards": [
            _queue_card("delivery_pending", "Delivery pending", due_deliveries.count(), "subscriptions.Subscription", "/admin/deliveries"),
            _queue_card("handover_pending", "Handover pending", due_deliveries.count(), "subscriptions.Subscription", "/admin/deliveries"),
            _queue_card("delivery_blocked", "Delivery blocked", blocked_deliveries.count(), "subscriptions.Subscription", "/admin/deliveries"),
            _queue_card("return_due", "Return due", return_due.count(), "subscriptions.RentLeaseReturnInspection", "/admin/service-desk/returns"),
            _queue_card("return_inspection", "Return inspection", return_inspection_pending.count(), "subscriptions.RentLeaseReturnInspection", "/admin/service-desk/returns"),
            _queue_card(
                "damaged_return",
                "Damaged return",
                RentLeaseReturnInspection.objects.filter(condition_recorded="DAMAGED").count(),
                "subscriptions.RentLeaseReturnInspection",
                "/admin/service-desk/returns",
            ),
        ]
    }
    User = get_user_model()
    results["partner_workspace"] = {
        "cards": [
            _queue_card("partner_requests", "Partner requests", pending_partner_requests.count(), "subscriptions.PartnerCollectionRequest", "/admin/partner-payment-requests"),
            _queue_card(
                "partner_customers",
                "Partner customers",
                Customer.objects.filter(created_by_partner_user__isnull=False).count(),
                "subscriptions.Customer",
                "/admin/partners",
            ),
            _queue_card("partner_payments", "Partner payments", Payment.objects.filter(collected_by__role="PARTNER").count(), "subscriptions.Payment", "/admin/partners/workspace"),
            _queue_card("partner_collections", "Partner collections", pending_partner_requests.count(), "subscriptions.PartnerCollectionRequest", "/admin/partner-payment-requests"),
            _queue_card("commission", "Commission", Subscription.objects.filter(partner__isnull=False).count(), "subscriptions.Subscription", "/admin/finance/commissions"),
            _queue_card("payout", "Payout", Subscription.objects.filter(partner__isnull=False).count(), "subscriptions.Subscription", "/admin/finance/payout-batches"),
            _queue_card("partner_performance", "Partner performance", User.objects.filter(role="PARTNER").count(), "accounts.User", "/admin/reports/partners"),
        ]
    }
    return results


def build_admin_crm_workspace() -> dict:
    summary = build_admin_erp_summary()
    return {
        "as_of": summary["as_of"],
        "crm_pipeline": summary["crm_pipeline"],
        "today_work": summary["today_work"],
        "customer_360": [
            {
                "customer_id": customer.id,
                "name": customer.name,
                "phone": customer.phone,
                "kyc_status": customer.kyc_status,
                "subscription_count": Subscription.objects.filter(customer=customer).count(),
                "payment_count": Payment.objects.filter(subscription__customer=customer).count(),
                "delivery_count": SubscriptionDelivery.objects.filter(subscription__customer=customer).count(),
                "support_count": CustomerSupportRequest.objects.filter(customer=customer).count(),
                "partner_link": customer.created_by_partner_user_id,
                "risk_status": "HIGH" if Emi.objects.filter(subscription__customer=customer, status=EmiStatus.PENDING, due_date__lt=timezone.localdate()).exists() else "LOW",
                "deep_link": f"/admin/customers/{customer.id}",
            }
            for customer in Customer.objects.order_by("-created_at")[:20]
        ],
    }


def build_admin_global_search(*, query: str) -> dict:
    q = (query or "").strip()
    if not q:
        return {"count": 0, "results": []}

    results: list[dict] = []

    for customer in Customer.objects.filter(Q(name__icontains=q) | Q(phone__icontains=q)).order_by("name")[:10]:
        results.append(
            {
                "type": "customer",
                "title": customer.name,
                "subtitle": customer.phone,
                "status": customer.kyc_status,
                "deep_link": f"/admin/customers/{customer.id}",
            }
        )
    subscription_filter = Q(subscription_number__icontains=q)
    if q.isdigit():
        subscription_filter |= Q(lucky_id__lucky_number=int(q))
    for subscription in Subscription.objects.filter(subscription_filter).select_related("customer")[:10]:
        results.append(
            {
                "type": "subscription",
                "title": subscription.subscription_number,
                "subtitle": f"{subscription.customer.name} · {subscription.plan_type}",
                "status": subscription.status,
                "deep_link": f"/admin/subscriptions/{subscription.id}",
            }
        )
    for invoice in BillingInvoice.objects.filter(
        Q(document_no__icontains=q) | Q(source_reference__icontains=q)
    )[:10]:
        results.append(
            {
                "type": "invoice",
                "title": invoice.document_no,
                "subtitle": invoice.source_reference or "Invoice",
                "status": invoice.status,
                "deep_link": "/admin/billing/invoices",
            }
        )
    for receipt in ReceiptDocument.objects.filter(
        Q(receipt_no__icontains=q) | Q(source_reference__icontains=q)
    )[:10]:
        results.append(
            {
                "type": "receipt",
                "title": receipt.receipt_no or f"Receipt {receipt.id}",
                "subtitle": receipt.source_reference or "Receipt",
                "status": receipt.status,
                "deep_link": "/admin/billing/receipts",
            }
        )
    for sale in DirectSale.objects.filter(
        Q(sale_no__icontains=q) | Q(customer_name_snapshot__icontains=q) | Q(customer_phone_snapshot__icontains=q)
    )[:10]:
        results.append(
            {
                "type": "direct_sale",
                "title": sale.sale_no,
                "subtitle": sale.customer_name_snapshot or "Direct sale",
                "status": sale.status,
                "deep_link": "/admin/billing/direct-sale",
            }
        )
    for item in InventoryItem.objects.select_related("product").filter(
        Q(product__name__icontains=q) | Q(sku__icontains=q) | Q(product__product_code__icontains=q)
    )[:10]:
        results.append(
            {
                "type": "product",
                "title": item.product.name,
                "subtitle": item.sku or item.product.product_code,
                "status": "ACTIVE" if item.is_active else "INACTIVE",
                "deep_link": f"/admin/products/{item.product_id}",
            }
        )
    User = get_user_model()
    for partner in User.objects.filter(role="PARTNER").filter(
        Q(username__icontains=q) | Q(first_name__icontains=q) | Q(phone__icontains=q)
    )[:10]:
        results.append(
            {
                "type": "partner",
                "title": partner.get_full_name() or partner.username,
                "subtitle": partner.phone,
                "status": "ACTIVE" if partner.is_active else "INACTIVE",
                "deep_link": "/admin/partners",
            }
        )
    for request in SubscriptionRequest.objects.filter(
        Q(requested_customer_name__icontains=q)
        | Q(requested_customer_phone__icontains=q)
    )[:10]:
        results.append(
            {
                "type": "lead",
                "title": request.requested_customer_name or f"Request {request.id}",
                "subtitle": request.requested_customer_phone,
                "status": request.status,
                "deep_link": f"/admin/subscription-requests/{request.id}",
            }
        )
    return {"count": len(results), "results": results[:100]}
