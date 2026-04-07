from decimal import Decimal

from django.db.models import Sum
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from api.permissions import IsAdmin, IsCustomer, IsPartner
from subscriptions.models import Commission, Customer, FinancialLedger, Payment, Subscription
from subscriptions.services.winner_state_service import winner_history_q


@api_view(["GET"])
@permission_classes([IsCustomer])
def customer_subscription_report(request):
    customer = Customer.objects.filter(phone=request.user.phone).first()
    subscription = (
        Subscription.objects.filter(customer=customer)
        .select_related("batch", "lucky_id")
        .order_by("-created_at")
        .first()
    )

    if not subscription:
        return Response({"rows": []})

    rows = [
        {"label": "Customer", "value": customer.name if customer else request.user.username},
        {"label": "Batch", "value": subscription.batch.batch_code if subscription.batch else "N/A"},
        {"label": "Lucky ID", "value": f"{subscription.lucky_id.lucky_number:02d}" if subscription.lucky_id else "N/A"},
        {"label": "Plan Status", "value": subscription.status},
    ]

    return Response({"rows": rows})


@api_view(["GET"])
@permission_classes([IsCustomer])
def customer_payment_receipt_report(request):
    customer = Customer.objects.filter(phone=request.user.phone).first()
    payment = (
        Payment.objects.select_related("customer", "subscription", "emi")
        .filter(customer=customer)
        .order_by("-payment_date", "-id")
        .first()
    )

    if not payment:
        return Response({"rows": []})

    rows = [
        {"label": "Receipt No", "value": payment.reference_no or f"AUTO-{payment.id}"},
        {"label": "Amount", "value": f"INR {payment.amount}"},
        {"label": "Payment Mode", "value": payment.method},
        {"label": "Collected On", "value": payment.payment_date.isoformat()},
    ]

    return Response({"rows": rows})


@api_view(["GET"])
@permission_classes([IsCustomer])
def customer_emi_ledger_report(request):
    customer = Customer.objects.filter(phone=request.user.phone).first()
    totals = Payment.objects.filter(customer=customer).aggregate(total=Sum("amount"))

    rows = [
        {"label": "Total Paid", "value": f"INR {totals['total'] or Decimal('0.00')}"},
    ]

    return Response({"rows": rows})


@api_view(["GET"])
@permission_classes([IsPartner])
def partner_registration_report(request):
    rows = [
        {"label": "Partner Name", "value": request.user.get_full_name() or request.user.username},
        {"label": "Partner Code", "value": f"PT-{request.user.id:03d}"},
        {"label": "Commission Rate", "value": "5%"},
        {"label": "Status", "value": "ACTIVE" if request.user.is_active else "SUSPENDED"},
    ]
    return Response({"rows": rows})


@api_view(["GET"])
@permission_classes([IsPartner])
def partner_commission_ledger_report(request):
    commissions = Commission.objects.filter(partner=request.user).select_related("payment", "payment__customer")
    paid = commissions.filter(status="PAID").aggregate(total=Sum("commission_amount"))["total"] or Decimal("0.00")
    total = commissions.aggregate(total=Sum("commission_amount"))["total"] or Decimal("0.00")
    unpaid = total - paid

    rows = [
        {"label": "Total Earned", "value": f"INR {total}"},
        {"label": "Paid", "value": f"INR {paid}"},
        {"label": "Unpaid", "value": f"INR {unpaid}"},
    ]
    return Response({"rows": rows})


@api_view(["GET"])
@permission_classes([IsAdmin])
def admin_collection_ledger_report(request):
    total_collected = Payment.objects.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
    overdue = FinancialLedger.objects.filter(entry_type="OVERDUE").aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

    return Response({"rows": [{"label": "Total Collected", "value": f"INR {total_collected}"}, {"label": "Overdue", "value": f"INR {overdue}"}]})


@api_view(["GET"])
@permission_classes([IsAdmin])
def admin_waiver_ledger_report(request):
    waived = FinancialLedger.objects.filter(entry_type="WAIVER").aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
    winners = Subscription.objects.filter(winner_history_q()).distinct().count()

    return Response({"rows": [{"label": "Total Waived", "value": f"INR {waived}"}, {"label": "Winner Count", "value": str(winners)}]})


@api_view(["GET"])
@permission_classes([IsAdmin])
def admin_partner_payout_ledger_report(request):
    payable = Commission.objects.exclude(status="PAID").aggregate(total=Sum("commission_amount"))["total"] or Decimal("0.00")
    settled = Commission.objects.filter(status="PAID").aggregate(total=Sum("commission_amount"))["total"] or Decimal("0.00")

    return Response({"rows": [{"label": "Payable", "value": f"INR {payable}"}, {"label": "Settled", "value": f"INR {settled}"}]})
