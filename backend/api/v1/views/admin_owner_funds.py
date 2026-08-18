"""Admin Owner Fund Injection — capital injections and owner loans."""
from __future__ import annotations

import datetime
from decimal import Decimal, InvalidOperation

from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from accounting.models import (
    FinanceAccount,
    OwnerFundInjection,
    OwnerFundInjectionStatus,
    OwnerFundInjectionType,
    OwnerLoanInterestType,
    OwnerLoanRepaymentFrequency,
    OwnerLoanRepayment,
)
from accounting.services.owner_fund_service import (
    compute_repayment_schedule,
    create_owner_fund_injection,
    create_owner_loan_repayment,
    get_owner_funds_summary,
)
from api.v1.permissions import IsAdmin


def _serialize_injection(obj: OwnerFundInjection) -> dict:
    repayments = []
    if obj.injection_type == OwnerFundInjectionType.LOAN:
        for r in obj.repayments.select_related("finance_account", "posted_journal_entry").order_by("-date"):
            repayments.append({
                "id": r.id,
                "amount": str(r.amount),
                "date": str(r.date),
                "finance_account_id": r.finance_account_id,
                "finance_account_name": r.finance_account.name,
                "notes": r.notes,
                "journal_entry_no": r.posted_journal_entry.entry_no if r.posted_journal_entry else None,
            })
    return {
        "id": obj.id,
        "injection_type": obj.injection_type,
        "injection_type_display": obj.get_injection_type_display(),
        "amount": str(obj.amount),
        "date": str(obj.date),
        "finance_account_id": obj.finance_account_id,
        "finance_account_name": obj.finance_account.name,
        "description": obj.description,
        "reference": obj.reference,
        "status": obj.status,
        "loan_outstanding": str(obj.loan_outstanding),
        "tenure_months": obj.tenure_months,
        "interest_rate": str(obj.interest_rate) if obj.interest_rate is not None else None,
        "interest_type": obj.interest_type,
        "repayment_frequency": obj.repayment_frequency,
        "repayment_start_date": str(obj.repayment_start_date) if obj.repayment_start_date else None,
        "total_interest": str(obj.total_interest),
        "journal_entry_no": obj.posted_journal_entry.entry_no if obj.posted_journal_entry else None,
        "repayments": repayments,
        "created_at": obj.created_at.isoformat(),
    }


def _parse_date(val: str | None, field: str) -> datetime.date | None:
    if not val:
        return None
    try:
        return datetime.date.fromisoformat(val)
    except ValueError:
        raise ValueError(f"Invalid {field} format (use YYYY-MM-DD)")


def _parse_decimal(val, field: str) -> Decimal | None:
    if val is None or val == "":
        return None
    try:
        return Decimal(str(val))
    except InvalidOperation:
        raise ValueError(f"Invalid {field} value")


class AdminOwnerFundsListCreateView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        qs = (
            OwnerFundInjection.objects
            .select_related("finance_account", "posted_journal_entry")
            .prefetch_related("repayments__finance_account", "repayments__posted_journal_entry")
            .order_by("-date", "-id")
        )
        injection_type = request.query_params.get("type")
        if injection_type in (OwnerFundInjectionType.CAPITAL, OwnerFundInjectionType.LOAN):
            qs = qs.filter(injection_type=injection_type)

        results = [_serialize_injection(obj) for obj in qs[:100]]
        summary = get_owner_funds_summary()
        return Response({"results": results, "count": len(results), "summary": summary})

    def post(self, request):
        data = request.data
        injection_type = data.get("injection_type", "")
        if injection_type not in (OwnerFundInjectionType.CAPITAL, OwnerFundInjectionType.LOAN):
            return Response(
                {"error": "injection_type must be CAPITAL or LOAN"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            amount = _parse_decimal(data.get("amount", "0"), "amount")
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        if not amount or amount <= 0:
            return Response({"error": "Amount must be positive"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            entry_date = _parse_date(data.get("date"), "date")
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        if not entry_date:
            return Response({"error": "date is required"}, status=status.HTTP_400_BAD_REQUEST)

        finance_account_id = data.get("finance_account_id")
        try:
            finance_account = FinanceAccount.objects.select_related("chart_account").get(
                id=finance_account_id
            )
        except (FinanceAccount.DoesNotExist, TypeError, ValueError):
            return Response({"error": "Invalid finance_account_id"}, status=status.HTTP_400_BAD_REQUEST)

        # Loan-specific params
        tenure_months = None
        interest_rate = None
        interest_type = OwnerLoanInterestType.NONE
        repayment_frequency = OwnerLoanRepaymentFrequency.MONTHLY
        repayment_start_date = None

        if injection_type == OwnerFundInjectionType.LOAN:
            try:
                tenure_months = int(data.get("tenure_months") or 0) or None
                interest_rate = _parse_decimal(data.get("interest_rate"), "interest_rate")
            except (ValueError, TypeError) as e:
                return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

            raw_interest_type = data.get("interest_type", OwnerLoanInterestType.NONE)
            if raw_interest_type not in (OwnerLoanInterestType.FLAT, OwnerLoanInterestType.REDUCING, OwnerLoanInterestType.NONE):
                raw_interest_type = OwnerLoanInterestType.NONE
            interest_type = raw_interest_type

            raw_freq = data.get("repayment_frequency", OwnerLoanRepaymentFrequency.MONTHLY)
            if raw_freq not in (OwnerLoanRepaymentFrequency.MONTHLY, OwnerLoanRepaymentFrequency.QUARTERLY, OwnerLoanRepaymentFrequency.LUMP_SUM):
                raw_freq = OwnerLoanRepaymentFrequency.MONTHLY
            repayment_frequency = raw_freq

            try:
                repayment_start_date = _parse_date(data.get("repayment_start_date"), "repayment_start_date")
            except ValueError as e:
                return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            injection = create_owner_fund_injection(
                injection_type=injection_type,
                amount=amount,
                date=entry_date,
                finance_account=finance_account,
                description=data.get("description", ""),
                reference=data.get("reference", ""),
                tenure_months=tenure_months,
                interest_rate=interest_rate,
                interest_type=interest_type,
                repayment_frequency=repayment_frequency,
                repayment_start_date=repayment_start_date,
                performed_by=request.user,
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(_serialize_injection(
            OwnerFundInjection.objects.select_related("finance_account", "posted_journal_entry")
            .prefetch_related("repayments")
            .get(id=injection.id)
        ), status=status.HTTP_201_CREATED)


class AdminOwnerFundDetailView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        obj = get_object_or_404(
            OwnerFundInjection.objects
            .select_related("finance_account", "posted_journal_entry")
            .prefetch_related("repayments__finance_account", "repayments__posted_journal_entry"),
            pk=pk,
        )
        return Response(_serialize_injection(obj))


class AdminOwnerLoanScheduleView(APIView):
    """Returns the computed repayment schedule for an injection (GET) or a preview (POST)."""
    permission_classes = [IsAdmin]

    def get(self, request, pk=None):
        # This view is bound to two URLs: `<pk>/schedule/` (GET with pk) and
        # `schedule-preview/` (POST-only preview). A GET on the preview route has
        # no pk — respond with 405 rather than crashing on the missing argument.
        if pk is None:
            return Response(
                {"error": "Use POST to preview a schedule; GET requires an injection id."},
                status=status.HTTP_405_METHOD_NOT_ALLOWED,
            )
        injection = get_object_or_404(OwnerFundInjection, pk=pk)
        if injection.injection_type != OwnerFundInjectionType.LOAN:
            return Response({"error": "Not a loan injection"}, status=status.HTTP_400_BAD_REQUEST)
        if not injection.tenure_months:
            return Response({"schedule": [], "summary": {}})

        schedule = compute_repayment_schedule(
            principal=injection.amount,
            tenure_months=injection.tenure_months,
            annual_rate=injection.interest_rate or Decimal("0"),
            interest_type=injection.interest_type or OwnerLoanInterestType.NONE,
            frequency=injection.repayment_frequency or OwnerLoanRepaymentFrequency.MONTHLY,
            start_date=injection.repayment_start_date or injection.date,
        )
        paid_ids = set(injection.repayments.values_list("id", flat=True))
        total_interest = sum(Decimal(s["interest"]) for s in schedule)
        total_payable = injection.amount + total_interest
        return Response({
            "schedule": schedule,
            "summary": {
                "principal": str(injection.amount),
                "total_interest": str(total_interest),
                "total_payable": str(total_payable),
                "tenure_months": injection.tenure_months,
                "interest_rate": str(injection.interest_rate or "0"),
                "interest_type": injection.interest_type,
                "repayment_frequency": injection.repayment_frequency,
                "loan_outstanding": str(injection.loan_outstanding),
            },
        })

    def post(self, request):
        """Preview schedule without saving anything."""
        data = request.data
        try:
            principal = Decimal(str(data.get("amount", "0")))
            tenure_months = int(data.get("tenure_months") or 0)
            interest_rate = Decimal(str(data.get("interest_rate") or "0"))
        except (InvalidOperation, TypeError, ValueError) as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        interest_type = data.get("interest_type", OwnerLoanInterestType.NONE)
        frequency = data.get("repayment_frequency", OwnerLoanRepaymentFrequency.MONTHLY)
        start_date_str = data.get("repayment_start_date")
        try:
            start_date = datetime.date.fromisoformat(start_date_str) if start_date_str else datetime.date.today()
        except ValueError:
            start_date = datetime.date.today()

        if principal <= 0 or tenure_months <= 0:
            return Response({"schedule": [], "summary": {}})

        schedule = compute_repayment_schedule(
            principal=principal,
            tenure_months=tenure_months,
            annual_rate=interest_rate,
            interest_type=interest_type,
            frequency=frequency,
            start_date=start_date,
        )
        total_interest = sum(Decimal(s["interest"]) for s in schedule)
        return Response({
            "schedule": schedule,
            "summary": {
                "principal": str(principal),
                "total_interest": str(total_interest),
                "total_payable": str(principal + total_interest),
                "tenure_months": tenure_months,
                "interest_rate": str(interest_rate),
                "interest_type": interest_type,
                "repayment_frequency": frequency,
            },
        })


class AdminOwnerLoanRepayView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        injection = get_object_or_404(OwnerFundInjection, pk=pk)

        data = request.data
        try:
            amount = _parse_decimal(data.get("amount", "0"), "amount")
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        if not amount or amount <= 0:
            return Response({"error": "Amount must be positive"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            entry_date = _parse_date(data.get("date"), "date")
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        if not entry_date:
            return Response({"error": "date is required"}, status=status.HTTP_400_BAD_REQUEST)

        finance_account_id = data.get("finance_account_id")
        try:
            finance_account = FinanceAccount.objects.select_related("chart_account").get(
                id=finance_account_id
            )
        except (FinanceAccount.DoesNotExist, TypeError, ValueError):
            return Response({"error": "Invalid finance_account_id"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            create_owner_loan_repayment(
                injection=injection,
                amount=amount,
                date=entry_date,
                finance_account=finance_account,
                notes=data.get("notes", ""),
                performed_by=request.user,
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        injection.refresh_from_db()
        return Response(_serialize_injection(
            OwnerFundInjection.objects.select_related("finance_account", "posted_journal_entry")
            .prefetch_related("repayments__finance_account", "repayments__posted_journal_entry")
            .get(id=injection.id)
        ))


class AdminOwnerFundsSummaryView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response(get_owner_funds_summary())
