"""
P3C — Admin read-only customer risk profile endpoints.

GET  /api/v1/admin/customers/<id>/risk-profile/
POST /api/v1/admin/customers/<id>/risk-profile/recalculate/

Access: ADMIN only.  Customer and Partner roles receive HTTP 403.
"""
from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from subscriptions.models import Customer, CustomerRiskProfile
from subscriptions.services.customer_risk_service import (
    get_customer_risk_profile,
    recalculate_customer_risk_profile,
)


def _serialize_profile(profile: CustomerRiskProfile, *, customer_id: int) -> dict:
    return {
        "customer_id": customer_id,
        "risk_score": profile.risk_score,
        "risk_band": profile.risk_band,
        "reason_codes": profile.reason_codes or [],
        "last_calculated_at": profile.last_calculated_at.isoformat() if profile.last_calculated_at else None,
        "metadata": profile.metadata or {},
        "is_persisted": bool(profile.pk),
    }


class AdminCustomerRiskProfileView(APIView):
    """
    GET /api/v1/admin/customers/<id>/risk-profile/

    Returns the stored risk profile (or a transient LOW default if never calculated).
    """

    permission_classes = [IsAdmin]

    def get(self, request, pk):
        try:
            customer = Customer.objects.get(pk=pk)
        except Customer.DoesNotExist:
            return Response({"detail": "Customer not found."}, status=status.HTTP_404_NOT_FOUND)

        profile = get_customer_risk_profile(customer)
        return Response(_serialize_profile(profile, customer_id=customer.pk))


class AdminCustomerRiskRecalculateView(APIView):
    """
    POST /api/v1/admin/customers/<id>/risk-profile/recalculate/

    Triggers a fresh risk calculation and persists the result.
    """

    permission_classes = [IsAdmin]

    def post(self, request, pk):
        try:
            customer = Customer.objects.get(pk=pk)
        except Customer.DoesNotExist:
            return Response({"detail": "Customer not found."}, status=status.HTTP_404_NOT_FOUND)

        profile = recalculate_customer_risk_profile(customer, performed_by=request.user)
        return Response(
            {
                "detail": "Risk profile recalculated.",
                **_serialize_profile(profile, customer_id=customer.pk),
            },
            status=status.HTTP_200_OK,
        )
