"""AML / KYC re-verification views."""
from __future__ import annotations

from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin


def _screening_row(s) -> dict:
    return {
        "id": s.id,
        "customer_id": s.customer_id,
        "customer_name": s.customer.name if hasattr(s, "_customer_cache") or s.customer_id else None,
        "screening_date": str(s.screening_date),
        "result": s.result,
        "screened_by": s.screened_by.get_full_name() or s.screened_by.username if s.screened_by else None,
        "checked_rbi_defaulter_list": s.checked_rbi_defaulter_list,
        "checked_interpol": s.checked_interpol,
        "checked_ofac": s.checked_ofac,
        "checked_un_sanctions": s.checked_un_sanctions,
        "checked_pep_list": s.checked_pep_list,
        "notes": s.notes,
        "watchlist_reference": s.watchlist_reference,
        "next_review_date": str(s.next_review_date) if s.next_review_date else None,
        "is_latest": s.is_latest,
        "created_at": s.created_at.isoformat(),
    }


class AdminAMLScreeningListView(APIView):
    """List AML screenings across all customers, or for a specific customer."""
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        from subscriptions.models import AMLScreeningRecord
        qs = AMLScreeningRecord.objects.select_related("customer", "screened_by").order_by("-screening_date", "-id")

        customer_id = request.query_params.get("customer_id", "")
        result = request.query_params.get("result", "")
        latest_only = request.query_params.get("latest_only", "")

        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        if result:
            qs = qs.filter(result=result)
        if latest_only in ("1", "true", "yes"):
            qs = qs.filter(is_latest=True)

        results = []
        for s in qs[:200]:
            row = _screening_row(s)
            row["customer_name"] = s.customer.name
            results.append(row)

        return Response({"count": len(results), "results": results})


class AdminCustomerAMLScreeningView(APIView):
    """Create a new AML screening record for a specific customer."""
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, customer_id):
        from subscriptions.models import AMLScreeningRecord, Customer
        try:
            customer = Customer.objects.get(pk=customer_id)
        except Customer.DoesNotExist:
            return Response({"detail": "Customer not found."}, status=404)

        screenings = AMLScreeningRecord.objects.filter(customer=customer).select_related("screened_by").order_by("-screening_date", "-id")
        latest = screenings.filter(is_latest=True).first()
        return Response({
            "customer_id": customer.id,
            "customer_name": customer.name,
            "is_pep": customer.is_pep,
            "pep_flagged_at": customer.pep_flagged_at.isoformat() if customer.pep_flagged_at else None,
            "aml_cleared": customer.aml_cleared,
            "aml_cleared_at": customer.aml_cleared_at.isoformat() if customer.aml_cleared_at else None,
            "latest_screening": _screening_row(latest) if latest else None,
            "history": [_screening_row(s) for s in screenings[:20]],
        })

    def post(self, request, customer_id):
        from subscriptions.models import AMLScreeningRecord, AMLScreeningResult, Customer
        from datetime import date

        try:
            customer = Customer.objects.get(pk=customer_id)
        except Customer.DoesNotExist:
            return Response({"detail": "Customer not found."}, status=404)

        result = request.data.get("result", AMLScreeningResult.PENDING)
        if result not in AMLScreeningResult.values:
            return Response({"detail": f"Invalid result. Choices: {AMLScreeningResult.values}"}, status=400)

        screening_date_raw = request.data.get("screening_date")
        try:
            screening_date = date.fromisoformat(str(screening_date_raw)) if screening_date_raw else timezone.localdate()
        except (TypeError, ValueError):
            screening_date = timezone.localdate()

        next_review_raw = request.data.get("next_review_date")
        next_review = None
        if next_review_raw:
            try:
                next_review = date.fromisoformat(str(next_review_raw))
            except (TypeError, ValueError):
                pass

        s = AMLScreeningRecord(
            customer=customer,
            screening_date=screening_date,
            result=result,
            screened_by=request.user,
            checked_rbi_defaulter_list=bool(request.data.get("checked_rbi_defaulter_list", False)),
            checked_interpol=bool(request.data.get("checked_interpol", False)),
            checked_ofac=bool(request.data.get("checked_ofac", False)),
            checked_un_sanctions=bool(request.data.get("checked_un_sanctions", False)),
            checked_pep_list=bool(request.data.get("checked_pep_list", False)),
            notes=(request.data.get("notes") or "").strip(),
            watchlist_reference=(request.data.get("watchlist_reference") or "").strip(),
            next_review_date=next_review,
            is_latest=True,
        )
        s.save()

        # Update customer AML flags
        now = timezone.now()
        if result == AMLScreeningResult.CLEAR:
            customer.aml_cleared = True
            customer.aml_cleared_at = now
            customer.is_pep = False
        elif result == AMLScreeningResult.PEP_CONFIRMED:
            customer.is_pep = True
            customer.pep_flagged_at = now
            customer.pep_flagged_by = request.user
            customer.aml_cleared = False
        elif result == AMLScreeningResult.SANCTIONED:
            customer.is_pep = False
            customer.aml_cleared = False
        customer.save(update_fields=["is_pep", "pep_flagged_at", "pep_flagged_by", "aml_cleared", "aml_cleared_at"])

        row = _screening_row(s)
        row["customer_name"] = customer.name
        return Response(row, status=201)


class AdminCustomerPEPFlagView(APIView):
    """Toggle PEP flag on a customer independently of a full screening."""
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, customer_id):
        from subscriptions.models import Customer
        try:
            customer = Customer.objects.get(pk=customer_id)
        except Customer.DoesNotExist:
            return Response({"detail": "Customer not found."}, status=404)

        flag = bool(request.data.get("is_pep", True))
        now = timezone.now()
        customer.is_pep = flag
        if flag:
            customer.pep_flagged_at = now
            customer.pep_flagged_by = request.user
            customer.aml_cleared = False
        else:
            customer.aml_cleared = False
        customer.save(update_fields=["is_pep", "pep_flagged_at", "pep_flagged_by", "aml_cleared"])
        return Response({"customer_id": customer.id, "is_pep": customer.is_pep})


class AdminKYCReverificationQueueView(APIView):
    """List KYC documents expiring soon or already expired — re-verification queue."""
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        from subscriptions.models import CustomerKycDocument, CustomerKycDocumentStatus
        from django.db.models import Q
        import datetime

        today = timezone.localdate()
        within_days = int(request.query_params.get("within_days", 60))
        threshold = today + datetime.timedelta(days=within_days)

        qs = (
            CustomerKycDocument.objects
            .filter(
                Q(expiry_date__lte=threshold) | Q(expiry_date__lt=today),
                status=CustomerKycDocumentStatus.APPROVED,
                expiry_date__isnull=False,
            )
            .select_related("customer", "reviewed_by")
            .order_by("expiry_date")
        )[:300]

        results = []
        for doc in qs:
            days_left = (doc.expiry_date - today).days if doc.expiry_date else None
            results.append({
                "document_id": doc.id,
                "customer_id": doc.customer_id,
                "customer_name": doc.customer.name,
                "document_type": doc.document_type,
                "category": doc.category,
                "expiry_date": str(doc.expiry_date) if doc.expiry_date else None,
                "days_left": days_left,
                "overdue": days_left < 0 if days_left is not None else False,
                "status": doc.status,
                "reviewed_by": doc.reviewed_by.get_full_name() if doc.reviewed_by else None,
            })

        return Response({"count": len(results), "results": results})


class AdminKYCRequestReverificationView(APIView):
    """Request re-verification for a specific KYC document (marks as RESUBMISSION_REQUIRED)."""
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, doc_id):
        from subscriptions.models import CustomerKycDocument, CustomerKycDocumentStatus

        try:
            doc = CustomerKycDocument.objects.select_related("customer").get(pk=doc_id)
        except CustomerKycDocument.DoesNotExist:
            return Response({"detail": "Document not found."}, status=404)

        reason = (request.data.get("reason") or "Document requires re-verification or has expired.").strip()
        old_status = doc.status
        doc.status = CustomerKycDocumentStatus.RESUBMISSION_REQUIRED
        doc.rejection_reason = reason
        doc.save(update_fields=["status", "rejection_reason"])

        # Optionally update customer KYC status back to pending
        customer = doc.customer
        from subscriptions.models import KycStatus
        if customer.kyc_status in (KycStatus.APPROVED, KycStatus.VERIFIED):
            customer.kyc_status = KycStatus.SUBMITTED
            customer.save(update_fields=["kyc_status"])

        return Response({
            "document_id": doc.id,
            "old_status": old_status,
            "new_status": doc.status,
            "customer_id": doc.customer_id,
            "reason": reason,
        })
