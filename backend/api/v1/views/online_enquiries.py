from __future__ import annotations

from decimal import Decimal

from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.models import CustomerPurchaseEnquiry, CustomerPurchaseEnquiryStatus
from accounting.services.online_purchase_enquiry_service import (
    build_vendor_sourcing_for_enquiry,
    create_draft_purchase_order_from_enquiry,
    log_audit_enquiry,
    request_vendor_quotes_for_enquiry,
    select_vendor_quote_for_enquiry,
)
from api.v1.permissions import IsAdmin
from api.v1.serializers.online_enquiries import (
    CustomerPurchaseEnquiryDetailSerializer,
    CustomerPurchaseEnquiryListSerializer,
    OnlineEnquiryDraftPurchaseOrderSerializer,
    OnlineEnquiryRequestQuotesSerializer,
    OnlineEnquirySelectQuoteSerializer,
)


class AdminOnlineEnquiryListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        qs = CustomerPurchaseEnquiry.objects.all().order_by("-created_at", "-id")
        st = (request.query_params.get("status") or "").strip().upper()
        if st:
            qs = qs.filter(status=st)
        total = qs.count()
        limit = min(max(int(request.query_params.get("limit") or 200), 1), 500)
        rows = qs[:limit]
        return Response(
            {
                "count": total,
                "results": CustomerPurchaseEnquiryListSerializer(rows, many=True).data,
            }
        )


class AdminOnlineEnquiryDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        enquiry = get_object_or_404(CustomerPurchaseEnquiry.objects.all(), pk=pk)
        return Response(CustomerPurchaseEnquiryDetailSerializer(enquiry).data)


class AdminOnlineEnquirySuggestVendorsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        enquiry = get_object_or_404(CustomerPurchaseEnquiry.objects.all(), pk=pk)
        if enquiry.status == CustomerPurchaseEnquiryStatus.CANCELLED:
            return Response({"detail": "Cancelled enquiries cannot be sourced."}, status=status.HTTP_400_BAD_REQUEST)
        rows = build_vendor_sourcing_for_enquiry(enquiry)
        if enquiry.status == CustomerPurchaseEnquiryStatus.NEW:
            enquiry.status = CustomerPurchaseEnquiryStatus.SOURCING
            enquiry.save(update_fields=["status", "updated_at"])
        log_audit_enquiry(
            enquiry,
            request.user,
            "ONLINE_ENQUIRY_SUGGEST_VENDORS",
            {"result_count": len(rows)},
        )
        return Response({"count": len(rows), "results": rows})


class AdminOnlineEnquiryRequestVendorQuotesView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        enquiry = get_object_or_404(CustomerPurchaseEnquiry.objects.all(), pk=pk)
        ser = OnlineEnquiryRequestQuotesSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            req = request_vendor_quotes_for_enquiry(
                enquiry=enquiry,
                vendor_ids=ser.validated_data["vendor_ids"],
                send_to_vendors=bool(ser.validated_data.get("send_to_vendors", True)),
                created_by=request.user,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        from api.v1.serializers.vendor_ops import VendorQuoteRequestSerializer

        log_audit_enquiry(
            enquiry,
            request.user,
            "ONLINE_ENQUIRY_REQUEST_VENDOR_QUOTES",
            {"vendor_quote_request_id": req.id},
        )
        return Response(VendorQuoteRequestSerializer(req).data, status=status.HTTP_201_CREATED)


class AdminOnlineEnquirySelectVendorQuoteView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        enquiry = get_object_or_404(CustomerPurchaseEnquiry.objects.all(), pk=pk)
        ser = OnlineEnquirySelectQuoteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            accepted = select_vendor_quote_for_enquiry(
                enquiry=enquiry,
                vendor_quote_id=int(ser.validated_data["vendor_quote_id"]),
                accepted_by=request.user,
                allow_on_hold_vendor=bool(ser.validated_data.get("allow_on_hold_vendor")),
                allow_blocked_vendor=bool(ser.validated_data.get("allow_blocked_vendor")),
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        from api.v1.serializers.vendor_ops import VendorQuoteSerializer

        return Response(
            {
                "enquiry_status": enquiry.status,
                "vendor_quote": VendorQuoteSerializer(accepted).data,
                "suggested_manual_purchase_order_url": "/admin/purchases/orders",
            }
        )


class AdminOnlineEnquiryCreatePurchaseDraftView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        enquiry = get_object_or_404(CustomerPurchaseEnquiry.objects.all(), pk=pk)
        ser = OnlineEnquiryDraftPurchaseOrderSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            po, meta = create_draft_purchase_order_from_enquiry(
                enquiry=enquiry,
                inventory_item_id=int(ser.validated_data["inventory_item_id"]),
                quantity=Decimal(str(ser.validated_data["quantity"])),
                unit_cost=Decimal(str(ser.validated_data["unit_cost"])),
                confirm=bool(ser.validated_data["confirm"]),
                performed_by=request.user,
                stock_location_id=ser.validated_data.get("stock_location_id"),
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "purchase_order": {
                    "id": po.id,
                    "po_no": po.po_no,
                    "status": po.status,
                    "vendor_id": po.vendor_id,
                },
                "meta": meta,
                "next_actions": {
                    "edit_draft_po": f"/admin/purchases/orders/{po.id}",
                    "inventory_orders_workspace": "/admin/purchases/orders",
                },
            },
            status=status.HTTP_201_CREATED if not meta.get("already_exists") else status.HTTP_200_OK,
        )
