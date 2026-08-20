from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin


class AdminAdvanceForfeitureCandidatesView(APIView):
    """GET /admin/finance/advance-forfeitures/ — dormant candidates + existing forfeitures."""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, *args, **kwargs):
        from payments.models import AdvanceForfeiture
        from payments.services.advance_forfeiture_service import identify_dormant_advances

        candidates = identify_dormant_advances()

        existing = AdvanceForfeiture.objects.select_related(
            "advance__customer", "forfeited_by",
        ).order_by("-created_at")[:200]

        existing_list = [
            {
                "id": f.id,
                "advance_id": f.advance_id,
                "status": f.status,
                "forfeited_amount": str(f.forfeited_amount),
                "dormant_since": str(f.dormant_since),
                "forfeiture_date": str(f.forfeiture_date) if f.forfeiture_date else None,
                "contact_attempts": f.contact_attempts or [],
                "legal_basis": f.legal_basis,
                "forfeited_by": (f.forfeited_by.get_full_name() or f.forfeited_by.username) if f.forfeited_by_id else None,
                "customer_name": getattr(f.advance.customer, "name", None) if f.advance.customer_id else None,
                "reversed_at": f.reversed_at.isoformat() if f.reversed_at else None,
                "reversal_reason": f.reversal_reason,
            }
            for f in existing
        ]

        return Response({
            "dormant_candidates": candidates,
            "existing_forfeitures": existing_list,
        })


class AdminAdvanceForfeitureContactAttemptView(APIView):
    """POST /admin/finance/advance-forfeitures/{advance_id}/contact-attempt/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, advance_id=None, *args, **kwargs):
        from payments.services.advance_forfeiture_service import record_contact_attempt

        method = (request.data.get("method") or "").strip()
        outcome = (request.data.get("outcome") or "").strip()
        if not method or not outcome:
            return Response({"detail": "Both 'method' and 'outcome' are required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = record_contact_attempt(
                advance_id=int(advance_id),
                method=method,
                outcome=outcome,
                actor=request.user,
            )
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=status.HTTP_200_OK)


class AdminAdvanceForfeitureExecuteView(APIView):
    """POST /admin/finance/advance-forfeitures/{advance_id}/forfeit/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, advance_id=None, *args, **kwargs):
        from payments.services.advance_forfeiture_service import forfeit_advance

        try:
            result = forfeit_advance(advance_id=int(advance_id), actor=request.user)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=status.HTTP_200_OK)


class AdminAdvanceForfeitureReverseView(APIView):
    """POST /admin/finance/advance-forfeitures/{id}/reverse/"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk=None, *args, **kwargs):
        from payments.services.advance_forfeiture_service import reverse_forfeiture

        reason = (request.data.get("reason") or "").strip()
        if not reason:
            return Response({"detail": "'reason' is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = reverse_forfeiture(forfeiture_id=int(pk), reason=reason, actor=request.user)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=status.HTTP_200_OK)
