from datetime import date, timedelta

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin


class AdminErasureRequestListView(APIView):
    """GET /admin/privacy/erasure-requests/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, *args, **kwargs):
        from privacy.dpdp_compliance_models import DataErasureGuard

        qs = DataErasureGuard.objects.select_related(
            "customer", "reviewed_by", "completed_by",
        ).order_by("-requested_at")[:200]

        results = [
            {
                "id": g.id,
                "customer_id": g.customer_id,
                "customer_name": getattr(g.customer, "name", None),
                "status": g.status,
                "request_reference": g.request_reference,
                "requested_at": g.requested_at.isoformat() if g.requested_at else None,
                "due_date": str(g.due_date),
                "is_overdue": g.is_overdue,
                "fields_to_erase": g.fields_to_erase,
                "fields_retained": g.fields_retained,
                "reviewed_by": (g.reviewed_by.get_full_name() or g.reviewed_by.username) if g.reviewed_by_id else None,
                "completed_at": g.completed_at.isoformat() if g.completed_at else None,
                "rejection_reason": g.rejection_reason,
                "audit_notes": g.audit_notes,
            }
            for g in qs
        ]
        return Response({"count": len(results), "results": results})

    def post(self, request, *args, **kwargs):
        """POST /admin/privacy/erasure-requests/ — create new erasure request."""
        from privacy.dpdp_compliance_models import DataErasureGuard

        customer_id = request.data.get("customer_id")
        if not customer_id:
            return Response({"detail": "'customer_id' is required."}, status=status.HTTP_400_BAD_REQUEST)

        from customers.models import Customer
        try:
            customer = Customer.objects.get(pk=int(customer_id))
        except Customer.DoesNotExist:
            return Response({"detail": "Customer not found."}, status=status.HTTP_404_NOT_FOUND)

        existing = DataErasureGuard.objects.filter(
            customer=customer, status__in=["RECEIVED", "UNDER_REVIEW", "PARTIALLY_COMPLETED"],
        ).first()
        if existing:
            return Response({"detail": f"Active erasure request already exists: {existing.request_reference}"}, status=status.HTTP_400_BAD_REQUEST)

        import uuid
        guard = DataErasureGuard.objects.create(
            customer=customer,
            request_reference=f"DPDP-{uuid.uuid4().hex[:8].upper()}",
            due_date=date.today() + timedelta(days=30),
            fields_to_erase=["name", "phone", "address", "city", "district", "state", "pincode", "kyc_documents"],
        )
        return Response({"id": guard.id, "request_reference": guard.request_reference, "due_date": str(guard.due_date)}, status=status.HTTP_201_CREATED)


class AdminErasurePreviewView(APIView):
    """GET /admin/privacy/erasure-requests/{id}/preview/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk=None, *args, **kwargs):
        from privacy.dpdp_compliance_models import DataErasureGuard
        from privacy.services.anonymization_service import get_erasure_preview

        try:
            guard = DataErasureGuard.objects.get(pk=pk)
        except DataErasureGuard.DoesNotExist:
            return Response({"detail": "Erasure request not found."}, status=status.HTTP_404_NOT_FOUND)

        preview = get_erasure_preview(customer_id=guard.customer_id)
        preview["erasure_guard_id"] = guard.id
        preview["status"] = guard.status
        preview["due_date"] = str(guard.due_date)
        preview["is_overdue"] = guard.is_overdue
        return Response(preview)


class AdminErasureExecuteView(APIView):
    """POST /admin/privacy/erasure-requests/{id}/execute/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk=None, *args, **kwargs):
        from privacy.services.anonymization_service import execute_erasure

        try:
            result = execute_erasure(erasure_guard_id=int(pk), actor=request.user)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=status.HTTP_200_OK)


class AdminErasureRejectView(APIView):
    """POST /admin/privacy/erasure-requests/{id}/reject/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk=None, *args, **kwargs):
        from privacy.services.anonymization_service import reject_erasure

        reason = (request.data.get("reason") or "").strip()
        if not reason:
            return Response({"detail": "'reason' is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = reject_erasure(erasure_guard_id=int(pk), reason=reason, actor=request.user)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=status.HTTP_200_OK)
