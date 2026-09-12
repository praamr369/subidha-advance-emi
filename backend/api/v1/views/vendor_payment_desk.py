"""Vendor page payment desk: pay bills, pay advance, apply advance."""
from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.models import Vendor
from accounting.services.vendor_payment_desk_service import (
    apply_vendor_advance,
    build_vendor_payment_desk,
    pay_vendor_advance,
    pay_vendor_bills,
)
from api.v1.permissions import IsAdmin


def _error(exc: ValidationError) -> Response:
    payload = exc.message_dict if hasattr(exc, "message_dict") else {"detail": " ".join(exc.messages)}
    return Response(payload, status=status.HTTP_400_BAD_REQUEST)


class _VendorDeskView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def _vendor(self, pk):
        return Vendor.objects.filter(pk=pk).first()


class AdminVendorPaymentDeskView(_VendorDeskView):
    """GET /api/v1/admin/vendors/<id>/payment-desk/"""

    def get(self, request, pk):
        vendor = self._vendor(pk)
        if vendor is None:
            return Response({"detail": "Vendor not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(build_vendor_payment_desk(vendor))


class AdminVendorPayBillsView(_VendorDeskView):
    """POST /api/v1/admin/vendors/<id>/payment-desk/pay-bills/"""

    def post(self, request, pk):
        if self._vendor(pk) is None:
            return Response({"detail": "Vendor not found."}, status=status.HTTP_404_NOT_FOUND)
        data = request.data
        try:
            result = pay_vendor_bills(
                vendor_id=pk,
                allocations=data.get("allocations") or [],
                finance_account_id=data.get("finance_account_id"),
                posted_by=request.user,
                payment_date=data.get("payment_date"),
                reference_no=data.get("reference_no") or "",
                notes=data.get("notes") or "",
            )
        except ValidationError as exc:
            return _error(exc)
        return Response(result)


class AdminVendorAdvancePaymentView(_VendorDeskView):
    """POST /api/v1/admin/vendors/<id>/payment-desk/advance/"""

    def post(self, request, pk):
        if self._vendor(pk) is None:
            return Response({"detail": "Vendor not found."}, status=status.HTTP_404_NOT_FOUND)
        data = request.data
        try:
            result = pay_vendor_advance(
                vendor_id=pk,
                amount=data.get("amount"),
                finance_account_id=data.get("finance_account_id"),
                posted_by=request.user,
                payment_date=data.get("payment_date"),
                reference_no=data.get("reference_no") or "",
                notes=data.get("notes") or "",
            )
        except ValidationError as exc:
            return _error(exc)
        return Response(result)


class AdminVendorApplyAdvanceView(_VendorDeskView):
    """POST /api/v1/admin/vendors/<id>/payment-desk/apply-advance/"""

    def post(self, request, pk):
        if self._vendor(pk) is None:
            return Response({"detail": "Vendor not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            result = apply_vendor_advance(
                vendor_id=pk,
                allocations=request.data.get("allocations") or [],
                performed_by=request.user,
                notes=request.data.get("notes") or "",
            )
        except ValidationError as exc:
            return _error(exc)
        return Response(result)
