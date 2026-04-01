"""
Deprecated payment admin view module.

This module is intentionally retained only as a compatibility stub while
admin payment operations are consolidated under:

    api.v1.views.admin_resources.PaymentAdminViewSet

Do not add new business logic here.
Do not register routes from this module.
Do not use this module for payment collection, verification, reversal,
or payment listing.

Canonical admin payment endpoints now live under:
    /api/v1/admin/payments/
    /api/v1/admin/payments/collect/
    /api/v1/admin/payments/{id}/timeline/
    /api/v1/admin/payments/{id}/reverse/

All payment mutations must go through:
    subscriptions.services.payment_service
"""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


class DeprecatedAdminPaymentView(APIView):
    """
    Hard stop for deprecated admin payment routes.

    Keep this class only if an old import path still points to this module
    during transition. It prevents silent financial mutations through legacy
    endpoints and gives a clear migration message.
    """

    permission_classes = [IsAuthenticated]

    message = (
        "This payment admin endpoint is deprecated. "
        "Use /api/v1/admin/payments/ for listing, "
        "/api/v1/admin/payments/collect/ for collection, "
        "/api/v1/admin/payments/{id}/timeline/ for timeline, and "
        "/api/v1/admin/payments/{id}/reverse/ for reversal."
    )

    def get(self, request, *args, **kwargs):
        return Response(
            {"detail": self.message},
            status=status.HTTP_410_GONE,
        )

    def post(self, request, *args, **kwargs):
        return Response(
            {"detail": self.message},
            status=status.HTTP_410_GONE,
        )

    def put(self, request, *args, **kwargs):
        return Response(
            {"detail": self.message},
            status=status.HTTP_410_GONE,
        )

    def patch(self, request, *args, **kwargs):
        return Response(
            {"detail": self.message},
            status=status.HTTP_410_GONE,
        )

    def delete(self, request, *args, **kwargs):
        return Response(
            {"detail": self.message},
            status=status.HTTP_410_GONE,
        )


class AdminVerifyPaymentView(DeprecatedAdminPaymentView):
    """
    Deprecated legacy alias retained temporarily for import compatibility.
    """
    pass


class AdminPendingPaymentsView(DeprecatedAdminPaymentView):
    """
    Deprecated legacy alias retained temporarily for import compatibility.
    """
    pass