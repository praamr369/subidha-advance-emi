from datetime import date
import logging
from typing import Any, Dict, List

from system_jobs.models import DashboardMemo

logger = logging.getLogger(__name__)


def _ev(
    id: str,
    date_str: str,
    title: str,
    source_type: str,
    href: str,
    is_completed: bool,
    color: str,
    customer_name: str | None = None,
) -> Dict[str, Any]:
    return {
        "id": id,
        "date": date_str,
        "title": title,
        "source_type": source_type,
        "href": href,
        "is_completed": is_completed,
        "color": color,
        "customer_name": customer_name,
    }


def _fmt_money(val) -> str:
    try:
        return f"₹{float(val or 0):,.2f}"
    except Exception:
        return f"₹{val}"


def fetch_dashboard_calendar_events(start_date: date, end_date: date, user) -> List[Dict[str, Any]]:
    events: List[Dict[str, Any]] = []
    dr = [start_date, end_date]

    # 1. Custom Memos
    try:
        for m in DashboardMemo.objects.filter(user=user, date__range=dr):
            events.append(_ev(
                f"memo-{m.id}", m.date.isoformat(), m.title,
                "MEMO", "", m.is_completed, m.color_code or "slate",
            ))
    except Exception as e:
        logger.warning("Calendar events error in Memos: %s", e)

    # 2. Direct Sales (All non-cancelled sales)
    try:
        from billing.models import DirectSale
        sales = (
            DirectSale.objects.filter(sale_date__range=dr)
            .exclude(status__in=["CANCELLED", "RETURNED", "ARCHIVED", "EXCHANGED_CLOSED"])
            .select_related("customer")
            .order_by("-sale_date", "-id")
        )
        for sale in sales:
            is_settled = float(sale.balance_total or 0) <= 0
            events.append(_ev(
                f"sale-{sale.id}",
                sale.sale_date.isoformat(),
                f"Sale {sale.sale_no} · {_fmt_money(sale.grand_total)}",
                "SALE",
                f"/admin/billing/direct-sale/{sale.id}",
                is_settled,
                "emerald" if is_settled else "orange",
                sale.customer.name if sale.customer else None,
            ))
    except Exception as e:
        logger.warning("Calendar events error in DirectSale: %s", e)

    # 3. Purchase Bills (Accounting Purchase Bills) & Legacy Vendor Bills
    try:
        from inventory.models import PurchaseBill, PurchaseBillStatus, VendorBill, VendorBillStatus
        pbills = (
            PurchaseBill.objects.filter(bill_date__range=dr)
            .exclude(status=PurchaseBillStatus.CANCELLED)
            .select_related("vendor")
            .order_by("-bill_date", "-id")
        )
        for bill in pbills:
            events.append(_ev(
                f"pbill-{bill.id}",
                bill.bill_date.isoformat(),
                f"Purchase {bill.bill_no} · {_fmt_money(bill.grand_total)} ({bill.status})",
                "PURCHASE",
                "/admin/accounting/purchase-bills",
                bill.status == PurchaseBillStatus.POSTED,
                "orange",
                bill.vendor.name if bill.vendor else None,
            ))
        vbills = (
            VendorBill.objects.filter(bill_date__range=dr)
            .exclude(status=VendorBillStatus.CANCELLED)
            .select_related("vendor")
            .order_by("-bill_date", "-id")
        )
        for bill in vbills:
            events.append(_ev(
                f"vbill-{bill.id}",
                bill.bill_date.isoformat(),
                f"Vendor Bill {bill.bill_no} · {_fmt_money(bill.grand_total)} ({bill.status})",
                "PURCHASE",
                "/admin/purchases/bills",
                bill.status == VendorBillStatus.POSTED,
                "orange",
                bill.vendor.name if bill.vendor else None,
            ))
    except Exception as e:
        logger.warning("Calendar events error in PurchaseBills: %s", e)

    # 4. Customer Payments (EMI + Rent/Lease Collections)
    try:
        from payments.models import Payment, RentLeaseCollection
        payments = (
            Payment.objects.filter(payment_date__range=dr)
            .select_related("customer", "subscription")
            .order_by("-payment_date", "-id")
        )
        for p in payments:
            events.append(_ev(
                f"pay-{p.id}",
                p.payment_date.isoformat(),
                f"EMI Collection · {_fmt_money(p.amount)} ({p.method})",
                "PAYMENT_IN",
                f"/admin/customers/subscriptions/{p.subscription_id}",
                True,
                "emerald",
                p.customer.name if p.customer else None,
            ))
        collections = (
            RentLeaseCollection.objects.filter(payment_date__range=dr, status="ACTIVE")
            .select_related("customer", "subscription")
            .order_by("-payment_date", "-id")
        )
        for c in collections:
            events.append(_ev(
                f"rlc-{c.id}",
                c.payment_date.isoformat(),
                f"{c.plan_type} Collection · {_fmt_money(c.amount)} ({c.payment_method})",
                "PAYMENT_IN",
                f"/admin/customers/subscriptions/{c.subscription_id}",
                True,
                "emerald",
                c.customer.name if c.customer else None,
            ))
    except Exception as e:
        logger.warning("Calendar events error in Payments: %s", e)

    # 5. Vendor Settlements & Vendor Payments
    try:
        from accounting.models import VendorSettlement, VendorSettlementStatus
        from inventory.models import VendorPayment, VendorPaymentStatus
        settlements = (
            VendorSettlement.objects.filter(settlement_date__range=dr)
            .exclude(status=VendorSettlementStatus.CANCELLED)
            .select_related("vendor")
            .order_by("-settlement_date", "-id")
        )
        for vs in settlements:
            events.append(_ev(
                f"vs-{vs.id}",
                vs.settlement_date.isoformat(),
                f"Vendor Paid {vs.settlement_no} · {_fmt_money(vs.amount)}",
                "VENDOR_PAYMENT",
                "/admin/vendors/settlements",
                vs.status == VendorSettlementStatus.POSTED,
                "orange",
                vs.vendor.name if vs.vendor else None,
            ))
        vpayments = (
            VendorPayment.objects.filter(payment_date__range=dr)
            .exclude(status=VendorPaymentStatus.CANCELLED)
            .select_related("vendor")
            .order_by("-payment_date", "-id")
        )
        for vp in vpayments:
            events.append(_ev(
                f"vp-{vp.id}",
                vp.payment_date.isoformat(),
                f"Vendor Payment {vp.payment_no} · {_fmt_money(vp.amount)}",
                "VENDOR_PAYMENT",
                "/admin/purchases/vendor-payments",
                vp.status == VendorPaymentStatus.POSTED,
                "orange",
                vp.vendor.name if vp.vendor else None,
            ))
    except Exception as e:
        logger.warning("Calendar events error in VendorPayments: %s", e)

    # 6. Staff Payments, Advances & Expense Vouchers
    try:
        from accounting.models import (
            ExpenseVoucher,
            ExpenseVoucherStatus,
            SalarySheet,
            SalarySheetStatus,
            StaffAdvance,
            StaffAdvanceStatus,
        )
        advances = (
            StaffAdvance.objects.filter(request_date__range=dr)
            .exclude(status__in=[StaffAdvanceStatus.CANCELLED, StaffAdvanceStatus.REJECTED])
            .select_related("employee")
            .order_by("-request_date", "-id")
        )
        for sa in advances:
            events.append(_ev(
                f"sadv-{sa.id}",
                sa.request_date.isoformat(),
                f"Staff Advance · {_fmt_money(sa.amount)} ({sa.status})",
                "STAFF_PAYMENT",
                "/admin/hr/payroll",
                sa.status in {StaffAdvanceStatus.DISBURSED, StaffAdvanceStatus.RECOVERED},
                "purple",
                str(sa.employee) if sa.employee else None,
            ))
        sheets = (
            SalarySheet.objects.filter(posted_journal_entry__entry_date__range=dr)
            .exclude(status=SalarySheetStatus.CANCELLED)
            .select_related("employee", "posted_journal_entry")
            .order_by("-id")
        )
        for ss in sheets:
            entry_dt = ss.posted_journal_entry.entry_date if ss.posted_journal_entry else ss.created_at.date()
            events.append(_ev(
                f"sal-{ss.id}",
                entry_dt.isoformat(),
                f"Salary {ss.month:02d}/{ss.year} · {_fmt_money(ss.net_amount)} ({ss.status})",
                "STAFF_PAYMENT",
                "/admin/hr/payroll",
                ss.status == SalarySheetStatus.PAID,
                "purple",
                str(ss.employee) if ss.employee else None,
            ))
        expenses = (
            ExpenseVoucher.objects.filter(expense_date__range=dr)
            .exclude(status=ExpenseVoucherStatus.CANCELLED)
            .select_related("vendor", "expense_account")
            .order_by("-expense_date", "-id")
        )
        for exp in expenses:
            party = exp.vendor.name if exp.vendor else (exp.expense_account.name if exp.expense_account else None)
            events.append(_ev(
                f"exp-{exp.id}",
                exp.expense_date.isoformat(),
                f"Expense {exp.voucher_no} · {_fmt_money(exp.net_amount)}",
                "EXPENSE",
                "/admin/accounting/expenses",
                exp.status == ExpenseVoucherStatus.POSTED,
                "red",
                party,
            ))
    except Exception as e:
        logger.warning("Calendar events error in Staff/Expenses: %s", e)

    # 7. Inventory Stock Movements
    try:
        from inventory.models import StockLedger
        ledgers = (
            StockLedger.objects.filter(movement_date__range=dr)
            .select_related("inventory_item", "inventory_item__product", "stock_location")
            .order_by("-movement_date", "-id")[:250]
        )
        for sl in ledgers:
            qty_in = float(sl.quantity_in or 0)
            qty_out = float(sl.quantity_out or 0)
            qty_label = f"+{qty_in:g}" if qty_in > 0 else f"-{qty_out:g}"
            item_name = (
                sl.inventory_item.product.name
                if sl.inventory_item and sl.inventory_item.product
                else (sl.inventory_item.sku if sl.inventory_item else "Item")
            )
            events.append(_ev(
                f"stk-{sl.id}",
                sl.movement_date.isoformat(),
                f"Stock {qty_label} · {item_name}",
                "STOCK",
                "/admin/inventory/ledger",
                True,
                "blue",
                sl.movement_type.replace("_", " "),
            ))
    except Exception as e:
        logger.warning("Calendar events error in StockLedger: %s", e)

    # 8. Subscription EMIs Due & Rent/Lease Demands Due
    try:
        from subscriptions.models import Emi, EmiStatus, RentLeaseBillingDemand, RentLeaseDemandStatus
        emis = Emi.objects.filter(
            due_date__range=dr,
            status__in=[EmiStatus.PENDING, EmiStatus.OVERDUE],
        ).select_related("subscription", "subscription__customer")
        for emi in emis:
            events.append(_ev(
                f"emi-{emi.id}",
                emi.due_date.isoformat(),
                f"EMI {emi.month_no} Due · {emi.subscription.subscription_number}",
                "EMI_DUE",
                f"/admin/customers/subscriptions/{emi.subscription.id}",
                False,
                "red",
                emi.subscription.customer.name if emi.subscription.customer else None,
            ))
        demands = RentLeaseBillingDemand.objects.filter(
            due_date__range=dr,
            status__in=[RentLeaseDemandStatus.PENDING, RentLeaseDemandStatus.PARTIAL, RentLeaseDemandStatus.OVERDUE],
        ).select_related("subscription", "subscription__customer")
        for d in demands:
            events.append(_ev(
                f"rld-{d.id}",
                d.due_date.isoformat(),
                f"{d.demand_type.replace('_', ' ').title()} Due · {_fmt_money(d.amount)}",
                "RENT_DUE",
                f"/admin/customers/subscriptions/{d.subscription_id}",
                False,
                "red",
                d.subscription.customer.name if d.subscription.customer else None,
            ))
    except Exception as e:
        logger.warning("Calendar events error in EMIs/Demands: %s", e)

    return events
