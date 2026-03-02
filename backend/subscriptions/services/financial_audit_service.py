# subscriptions/services/financial_audit_service.py

from decimal import Decimal
from django.db.models import Sum

from subscriptions.models import Subscription, Emi, Payment, FinancialLedger


def verify_emi_integrity(emi: Emi):

    payments_total = (
        Payment.objects
        .filter(emi=emi)
        .aggregate(total=Sum("amount"))["total"]
        or Decimal("0.00")
    )

    ledger_total = (
        FinancialLedger.objects
        .filter(emi=emi)
        .aggregate(total=Sum("amount"))["total"]
        or Decimal("0.00")
    )

    if payments_total != ledger_total:
        return {
            "emi_id": emi.id,
            "status": "MISMATCH",
            "payments_total": payments_total,
            "ledger_total": ledger_total,
        }

    return {"emi_id": emi.id, "status": "OK"}


def verify_subscription_integrity(subscription: Subscription):

    issues = []

    for emi in subscription.emis.all():
        result = verify_emi_integrity(emi)
        if result["status"] != "OK":
            issues.append(result)

    return {
        "subscription_id": subscription.id,
        "issues_found": len(issues),
        "details": issues,
    }


def system_financial_audit():

    report = []
    subscriptions = Subscription.objects.all()

    for sub in subscriptions:
        result = verify_subscription_integrity(sub)
        if result["issues_found"] > 0:
            report.append(result)

    return {
        "total_subscriptions_checked": subscriptions.count(),
        "problematic_subscriptions": len(report),
        "report": report,
    }