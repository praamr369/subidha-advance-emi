import datetime
from dataclasses import dataclass
from typing import Any, List, Dict
from django.db.models import Q
from system_jobs.models import DashboardMemo

@dataclass
class CalendarEventPayload:
    id: str
    date: str
    title: str
    source_type: str
    href: str
    is_completed: bool
    color: str
    customer_name: str | None = None

    def to_dict(self):
        return {
            "id": self.id,
            "date": self.date,
            "title": self.title,
            "source_type": self.source_type,
            "href": self.href,
            "is_completed": self.is_completed,
            "color": self.color,
            "customer_name": self.customer_name,
        }

def _ev(id, date, title, source_type, href, is_completed, color, customer_name=None):
    return CalendarEventPayload(
        id=id, date=date, title=title, source_type=source_type,
        href=href, is_completed=is_completed, color=color,
        customer_name=customer_name,
    ).to_dict()


def fetch_dashboard_calendar_events(start_date: datetime.date, end_date: datetime.date, user) -> List[Dict[str, Any]]:
    events = []
    dr = [start_date, end_date]

    # 1. Custom Memos
    for m in DashboardMemo.objects.filter(user=user, date__range=dr):
        events.append(_ev(
            f"memo-{m.id}", m.date.isoformat(), m.title,
            "MEMO", "", m.is_completed, m.color_code or "slate",
        ))

    # 2. Subscription EMIs (Due)
    from subscriptions.models import Emi, EmiStatus
    emis = Emi.objects.filter(
        due_date__range=dr,
        status__in=[EmiStatus.PENDING, EmiStatus.OVERDUE]
    ).select_related('subscription', 'subscription__customer')
    for emi in emis:
        events.append(_ev(
            f"emi-{emi.id}", emi.due_date.isoformat(),
            f"EMI {emi.month_no} - {emi.subscription.subscription_no}",
            "SUBSCRIPTION_EMI", f"/admin/customers/subscriptions/{emi.subscription.id}",
            False, "red",
            emi.subscription.customer.name if emi.subscription.customer else None,
        ))

    # 3. Direct Sales (Outstanding)
    from billing.models import DirectSale
    ds = DirectSale.objects.filter(
        sale_date__range=dr, balance_total__gt=0
    ).exclude(status__in=["CANCELLED", "RETURNED", "ARCHIVED", "EXCHANGED_CLOSED"]).select_related('customer')
    for sale in ds:
        events.append(_ev(
            f"ds-{sale.id}", sale.sale_date.isoformat(),
            f"Direct Sale {sale.sale_no}", "DIRECT_SALE",
            f"/admin/billing/direct-sale/{sale.id}", False, "orange",
            sale.customer.name if sale.customer else None,
        ))

    # 4. Purchase Orders (Expected Delivery)
    from inventory.models import PurchaseOrder
    pos = PurchaseOrder.objects.filter(
        expected_date__range=dr
    ).exclude(status__in=["CANCELLED", "CLOSED"]).select_related('vendor')
    for po in pos:
        if po.expected_date:
            events.append(_ev(
                f"po-{po.id}", po.expected_date.isoformat(),
                f"PO {po.po_no}", "PURCHASE_ORDER",
                f"/admin/inventory/po/{po.id}", po.status == "RECEIVED", "blue",
                po.vendor.name if po.vendor else None,
            ))

    # 5. CRM Leads (Follow-up Date)
    from crm.models import Lead, LeadStage
    leads = Lead.objects.filter(
        next_follow_up_at__date__range=dr
    ).exclude(stage__in=[LeadStage.CONVERTED, LeadStage.LOST])
    for lead in leads:
        events.append(_ev(
            f"lead-{lead.id}", lead.next_follow_up_at.date().isoformat() if lead.next_follow_up_at else "",
            f"Follow-up: {lead.name}", "CRM_LEAD",
            f"/admin/crm/leads/{lead.id}", False, "emerald", lead.name,
        ))

    # 6. Deliveries (Scheduled)
    from deliveries.models import Delivery
    deliveries = Delivery.objects.filter(
        scheduled_date__range=dr
    ).exclude(status__in=["DELIVERED", "CANCELLED"]).select_related('subscription', 'subscription__customer')
    for d in deliveries:
        cust = d.subscription.customer if d.subscription and d.subscription.customer_id else None
        events.append(_ev(
            f"del-{d.id}", d.scheduled_date.isoformat(),
            f"Delivery - {d.subscription.subscription_no if d.subscription else d.id}",
            "DELIVERY", f"/admin/deliveries/{d.id}", False, "orange",
            cust.name if cust else None,
        ))

    # 7. Rent/Lease Billing Demands (Due)
    from payments.models import RentLeaseBillingDemand
    from subscriptions.enums import RentLeaseDemandStatus
    demands = RentLeaseBillingDemand.objects.filter(
        due_date__range=dr,
        status__in=[RentLeaseDemandStatus.PENDING, RentLeaseDemandStatus.PARTIAL, RentLeaseDemandStatus.OVERDUE],
    ).select_related('subscription', 'subscription__customer')
    for dem in demands:
        cust = dem.subscription.customer if dem.subscription and dem.subscription.customer_id else None
        events.append(_ev(
            f"rld-{dem.id}", dem.due_date.isoformat(),
            f"Rent/Lease Due - {dem.demand_type}",
            "RENT_LEASE_DEMAND", f"/admin/rent-lease", False, "red",
            cust.name if cust else None,
        ))

    # 8. Vendor Bills (Due/Draft)
    from inventory.models import VendorBill, VendorBillStatus
    vbills = VendorBill.objects.filter(
        bill_date__range=dr,
        status__in=[VendorBillStatus.DRAFT, VendorBillStatus.POSTED],
    ).select_related('vendor')
    for vb in vbills:
        events.append(_ev(
            f"vb-{vb.id}", vb.bill_date.isoformat(),
            f"Vendor Bill {vb.bill_no}", "VENDOR_BILL",
            f"/admin/inventory/vendor-bills/{vb.id}", False, "orange",
            vb.vendor.name if vb.vendor else None,
        ))

    # 9. Salary Sheets (by period month/year)
    try:
        from accounting.models import SalarySheet, SalarySheetStatus
        sheets = SalarySheet.objects.filter(
            year__gte=start_date.year, year__lte=end_date.year,
            status__in=[SalarySheetStatus.DRAFT, SalarySheetStatus.APPROVED, SalarySheetStatus.POSTED],
        )
        for ss in sheets:
            sheet_date = datetime.date(ss.year, ss.month, 1)
            if start_date <= sheet_date <= end_date:
                events.append(_ev(
                    f"sal-{ss.id}", sheet_date.isoformat(),
                    f"Payroll - {ss.employee.name if ss.employee else ss.id} ({ss.month}/{ss.year})",
                    "SALARY", "/admin/hr/payroll", False, "blue",
                ))
    except Exception:
        pass

    # 10. Commissions (Pending)
    try:
        from subscriptions.models import Commission, CommissionStatus
        comms = Commission.objects.filter(
            status=CommissionStatus.PENDING,
            created_at__date__range=dr,
        ).select_related('partner')
        for c in comms:
            events.append(_ev(
                f"com-{c.id}", c.created_at.date().isoformat(),
                f"Commission Pending", "COMMISSION",
                f"/admin/finance/commissions", False, "emerald",
                c.partner.name if hasattr(c, 'partner') and c.partner else None,
            ))
    except Exception:
        pass

    # 11. Warranty Claims (Expiring)
    try:
        from service_desk.models import WarrantyClaim
        wclaims = WarrantyClaim.objects.filter(
            warranty_end_date__range=dr,
        )
        for wc in wclaims:
            events.append(_ev(
                f"wty-{wc.id}", wc.warranty_end_date.isoformat(),
                f"Warranty Expiry - {wc.product.name if wc.product_id else wc.id}",
                "WARRANTY", f"/admin/service-desk/warranty/{wc.id}", False, "red",
            ))
    except Exception:
        pass

    # 12. Production Jobs
    try:
        from manufacturing.models import ProductionJob, ProductionJobStatus
        jobs = ProductionJob.objects.filter(
            job_date__range=dr,
        ).exclude(status__in=[ProductionJobStatus.COMPLETED, ProductionJobStatus.CANCELLED])
        for j in jobs:
            events.append(_ev(
                f"pj-{j.id}", j.job_date.isoformat(),
                f"Production - {j.job_no}", "PRODUCTION",
                f"/admin/manufacturing/jobs/{j.id}", False, "blue",
            ))
    except Exception:
        pass

    # 13. Product Return Window Expiry
    try:
        from deliveries.models import ReturnEligibility
        returns = ReturnEligibility.objects.filter(
            delivery_date__range=dr,
        )
        for r in returns:
            events.append(_ev(
                f"ret-{r.id}", r.delivery_date.isoformat(),
                f"Return Window - {r.id}", "PRODUCT_RETURN",
                f"/admin/deliveries", False, "orange",
            ))
    except Exception:
        pass

    events.sort(key=lambda x: x["date"])
    return events
