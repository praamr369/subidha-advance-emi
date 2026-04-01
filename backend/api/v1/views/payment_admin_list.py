"""
Deprecated payment admin list module.

This module is retained only as a compatibility stub while all admin payment
listing/filtering is consolidated under:

    api.v1.views.admin_resources.PaymentAdminViewSet

Do not register routes from this module.
Do not add new query logic here.
Do not use this module for pending payment dashboards or admin payment listing.

Canonical admin payment list endpoint now lives under:
    /api/v1/admin/payments/

Use query params on the canonical route instead of this legacy endpoint.
"""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


class DeprecatedAdminPaymentListView(APIView):
    """
    Hard-stop compatibility endpoint for deprecated admin payment list routes.
    """

    permission_classes = [IsAuthenticated]

    message = (
        "This admin payment list endpoint is deprecated. "
        "Use /api/v1/admin/payments/ instead."
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


class AdminPendingPaymentsView(DeprecatedAdminPaymentListView):
    """
    Deprecated legacy alias retained temporarily for import compatibility.
    """
    pass