from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import permissions, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.models import Vendor, VendorLedgerEntry, VendorProduct, VendorQuote, VendorQuoteRequest
from accounts.models import User
from accounting.services.vendor_ledger_service import (
    get_vendor_ledger,
    get_vendor_outstanding,
    get_vendor_purchase_summary,
    get_vendor_return_summary,
)
from accounting.services.vendor_quote_service import (
    accept_vendor_quote,
    create_vendor_quote_request,
    mark_vendor_quote_submitted,
    reject_vendor_quote,
    vendor_quote_request_visible_to_vendor,
)
from accounting.services.vendor_sourcing_service import suggest_vendors_for_order
from api.v1.permissions import IsAdmin, IsVendor
from api.v1.serializers.vendor_ops import (
    VendorAccountLinkSerializer,
    VendorCategorySerializer,
    VendorLedgerEntrySerializer,
    VendorOpsSerializer,
    VendorProductSerializer,
    VendorQuoteRequestCreateSerializer,
    VendorQuoteRequestPortalSerializer,
    VendorQuoteRequestSerializer,
    VendorQuoteSerializer,
    VendorSourcingSuggestSerializer,
)
from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit


class AdminVendorViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    queryset = Vendor.objects.prefetch_related("categories", "addresses", "service_areas", "products").all().order_by("name", "id")
    serializer_class = VendorOpsSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]


class AdminVendorCategoryViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    queryset = __import__("accounting.models", fromlist=["VendorCategory"]).VendorCategory.objects.all().order_by("name", "id")
    serializer_class = VendorCategorySerializer
    http_method_names = ["get", "post", "patch", "head", "options"]


class AdminVendorCategoryListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        qs = __import__("accounting.models", fromlist=["VendorCategory"]).VendorCategory.objects.all().order_by("name", "id")
        return Response(VendorCategorySerializer(qs, many=True).data)

    def post(self, request):
        serializer = VendorCategorySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        row = serializer.save()
        return Response(VendorCategorySerializer(row).data, status=status.HTTP_201_CREATED)


class AdminVendorProductsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        rows = VendorProduct.objects.filter(vendor_id=pk).order_by("product_name", "id")
        return Response({"count": rows.count(), "results": VendorProductSerializer(rows, many=True).data})

    def post(self, request, pk: int):
        payload = dict(request.data)
        payload["vendor"] = pk
        serializer = VendorProductSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        row = serializer.save()
        return Response(VendorProductSerializer(row).data, status=status.HTTP_201_CREATED)


class AdminVendorLedgerView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        vendor = Vendor.objects.get(pk=pk)
        payload = get_vendor_ledger(
            vendor,
            {
                "entry_type": request.query_params.get("entry_type"),
                "date_from": request.query_params.get("date_from"),
                "date_to": request.query_params.get("date_to"),
            },
        )
        rows = VendorLedgerEntry.objects.filter(id__in=[row["id"] for row in payload["results"]]).order_by("-posted_at", "-id")
        return Response({"count": payload["count"], "results": VendorLedgerEntrySerializer(rows, many=True).data})


class AdminVendorOutstandingView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        vendor = Vendor.objects.get(pk=pk)
        return Response(get_vendor_outstanding(vendor))


class AdminVendorPurchasesView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        vendor = Vendor.objects.get(pk=pk)
        return Response(get_vendor_purchase_summary(vendor))


class AdminVendorPurchaseReturnsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        vendor = Vendor.objects.get(pk=pk)
        return Response(get_vendor_return_summary(vendor))


class AdminVendorSourcingSuggestView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        serializer = VendorSourcingSuggestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rows = suggest_vendors_for_order(**serializer.validated_data)
        return Response({"count": len(rows), "results": rows})


class AdminVendorSourcingRequestQuotesView(APIView):
    """Creates a VendorQuoteRequest for selected vendors — no purchase order, bill, payment, or stock posting."""

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        serializer = VendorQuoteRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        base_payload, vendor_ids, send_to_vendors = serializer.to_base_payload()
        try:
            row = create_vendor_quote_request(
                base_fields=base_payload,
                vendor_ids=vendor_ids,
                send_to_vendors=send_to_vendors,
                created_by=request.user,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        log_audit(
            action_type=AuditLog.ActionType.USER_UPDATED,
            instance=row,
            performed_by=request.user,
            metadata={
                "event": "VENDOR_SOURCING_REQUEST_QUOTES",
                "vendor_quote_request_id": row.id,
                "vendor_ids": vendor_ids,
                "send_to_vendors": send_to_vendors,
            },
        )
        return Response(VendorQuoteRequestSerializer(row).data, status=status.HTTP_201_CREATED)


class AdminVendorQuoteRequestListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        qs = (
            VendorQuoteRequest.objects.prefetch_related("quotes__vendor")
            .all()
            .order_by("-created_at", "-id")
        )
        return Response({"count": qs.count(), "results": VendorQuoteRequestSerializer(qs, many=True).data})

    def post(self, request):
        serializer = VendorQuoteRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        base_payload, vendor_ids, send_to_vendors = serializer.to_base_payload()
        try:
            row = create_vendor_quote_request(
                base_fields=base_payload,
                vendor_ids=vendor_ids,
                send_to_vendors=send_to_vendors,
                created_by=request.user,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        log_audit(
            action_type=AuditLog.ActionType.USER_UPDATED,
            instance=row,
            performed_by=request.user,
            metadata={
                "event": "VENDOR_QUOTE_REQUEST_CREATED",
                "vendor_quote_request_id": row.id,
                "vendor_ids": vendor_ids,
                "send_to_vendors": send_to_vendors,
            },
        )
        return Response(VendorQuoteRequestSerializer(row).data, status=status.HTTP_201_CREATED)


class AdminVendorQuoteRequestDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        row = VendorQuoteRequest.objects.prefetch_related("quotes__vendor").get(pk=pk)
        return Response(VendorQuoteRequestSerializer(row).data)


class AdminVendorQuoteAcceptView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        try:
            quote = accept_vendor_quote(quote_pk=pk, accepted_by=request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        log_audit(
            action_type=AuditLog.ActionType.USER_UPDATED,
            instance=quote,
            performed_by=request.user,
            metadata={
                "event": "VENDOR_QUOTE_ACCEPTED",
                "vendor_quote_id": quote.id,
                "vendor_quote_request_id": quote.quote_request_id,
            },
        )
        body = dict(VendorQuoteSerializer(quote).data)
        body["suggested_purchase_order_url"] = f"/admin/purchases/orders?vendor_quote_id={quote.id}"
        return Response(body)


class AdminVendorQuoteRejectView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        try:
            quote = reject_vendor_quote(quote_pk=pk, rejected_by=request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        log_audit(
            action_type=AuditLog.ActionType.USER_UPDATED,
            instance=quote,
            performed_by=request.user,
            metadata={"event": "VENDOR_QUOTE_REJECTED", "vendor_quote_id": quote.id},
        )
        return Response(VendorQuoteSerializer(quote).data)


class AdminVendorAccountLinkView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        vendor = Vendor.objects.select_related("linked_user").get(pk=pk)
        return Response({"vendor_id": vendor.id, "linked_user_id": vendor.linked_user_id})

    def post(self, request, pk: int):
        return self._mutate(request, pk=pk)

    def patch(self, request, pk: int):
        return self._mutate(request, pk=pk)

    def delete(self, request, pk: int):
        serializer = VendorAccountLinkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vendor = Vendor.objects.get(pk=pk)
        old_user_id = vendor.linked_user_id
        vendor.linked_user = None
        vendor.save(update_fields=["linked_user", "updated_at"])
        log_audit(
            action_type=AuditLog.ActionType.USER_UPDATED,
            instance=vendor,
            performed_by=request.user,
            metadata={"event": "VENDOR_ACCOUNT_UNLINKED", "old_user_id": old_user_id, "new_user_id": None, "reason": serializer.validated_data["reason"]},
        )
        return Response({"vendor_id": vendor.id, "linked_user_id": None})

    def _mutate(self, request, *, pk: int):
        serializer = VendorAccountLinkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vendor = Vendor.objects.get(pk=pk)
        user_id = serializer.validated_data.get("user_id")
        if not user_id:
            return Response({"user_id": ["user_id is required."]}, status=status.HTTP_400_BAD_REQUEST)
        duplicate = Vendor.objects.filter(linked_user_id=user_id).exclude(pk=vendor.pk).first()
        if duplicate:
            return Response({"user_id": ["Duplicate active vendor-user mapping is not allowed."]}, status=status.HTTP_400_BAD_REQUEST)
        old_user_id = vendor.linked_user_id
        vendor.linked_user_id = user_id
        vendor.save(update_fields=["linked_user", "updated_at"])
        disable_portal = bool(serializer.validated_data.get("disable_portal_access"))
        if disable_portal:
            linked_user = User.objects.filter(pk=user_id).first()
            if linked_user is not None:
                linked_user.is_active = False
                linked_user.save(update_fields=["is_active"])
        log_audit(
            action_type=AuditLog.ActionType.USER_UPDATED,
            instance=vendor,
            performed_by=request.user,
            metadata={
                "event": "VENDOR_ACCOUNT_LINK_UPDATED",
                "old_user_id": old_user_id,
                "new_user_id": user_id,
                "reason": serializer.validated_data["reason"],
                "disable_portal_access": disable_portal,
            },
        )
        return Response({"vendor_id": vendor.id, "linked_user_id": vendor.linked_user_id})


class VendorSelfDashboardView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsVendor]

    def get(self, request):
        vendor = Vendor.objects.filter(linked_user=request.user).first()
        if vendor is None:
            return Response({"detail": "No vendor profile linked."}, status=status.HTTP_404_NOT_FOUND)
        pending_quote_requests = VendorQuoteRequest.objects.filter(quotes__vendor=vendor).distinct().count()
        accepted_quotes = VendorQuote.objects.filter(vendor=vendor, status="ACCEPTED").count()
        purchase_orders = vendor.purchase_orders.count()
        returns_count = __import__("billing.models", fromlist=["PurchaseReturn"]).PurchaseReturn.objects.filter(vendor=vendor).count()
        outstanding_payload = get_vendor_outstanding(vendor)
        ledger_payload = get_vendor_ledger(vendor, {})
        purchase_payload = get_vendor_purchase_summary(vendor)
        return Response(
            {
                "vendor_id": vendor.id,
                "pending_quote_requests": pending_quote_requests,
                "accepted_quotes": accepted_quotes,
                "purchase_orders": purchase_orders,
                "purchase_returns": returns_count,
                "outstanding_payable": outstanding_payload["outstanding"],
                "products_count": vendor.products.filter(active=True).count(),
                "recent_ledger_entries": ledger_payload["results"][:8],
                "pending_purchase_bills": purchase_payload["summary"]["approved_total"],
            }
        )


class VendorSelfProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsVendor]

    def get(self, request):
        vendor = Vendor.objects.filter(linked_user=request.user).first()
        if vendor is None:
            return Response({"detail": "No vendor profile linked."}, status=status.HTTP_404_NOT_FOUND)
        return Response(VendorOpsSerializer(vendor).data)


class VendorSelfLedgerView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsVendor]

    def get(self, request):
        vendor = Vendor.objects.filter(linked_user=request.user).first()
        if vendor is None:
            return Response({"count": 0, "results": []})
        payload = get_vendor_ledger(
            vendor,
            {
                "entry_type": request.query_params.get("entry_type"),
                "date_from": request.query_params.get("date_from"),
                "date_to": request.query_params.get("date_to"),
            },
        )
        rows = VendorLedgerEntry.objects.filter(id__in=[row["id"] for row in payload["results"]]).order_by("-posted_at", "-id")
        return Response({"count": payload["count"], "results": VendorLedgerEntrySerializer(rows, many=True).data})


class VendorSelfOutstandingView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsVendor]

    def get(self, request):
        vendor = Vendor.objects.filter(linked_user=request.user).first()
        if vendor is None:
            return Response({"outstanding": "0.00"})
        return Response(get_vendor_outstanding(vendor))


class VendorSelfQuoteRequestsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsVendor]

    def get(self, request):
        vendor = Vendor.objects.filter(linked_user=request.user).first()
        if vendor is None:
            return Response({"count": 0, "results": []})
        rows = vendor_quote_request_visible_to_vendor(
            VendorQuoteRequest.objects.prefetch_related("quotes__vendor").order_by("-created_at", "-id"),
            vendor,
        )
        return Response(
            {
                "count": rows.count(),
                "results": VendorQuoteRequestPortalSerializer(rows, many=True, context={"vendor": vendor}).data,
            }
        )


class VendorSelfQuoteRequestDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsVendor]

    def get(self, request, pk: int):
        vendor = Vendor.objects.filter(linked_user=request.user).first()
        if vendor is None:
            return Response({"detail": "No vendor profile linked."}, status=status.HTTP_404_NOT_FOUND)
        rows = vendor_quote_request_visible_to_vendor(
            VendorQuoteRequest.objects.prefetch_related("quotes__vendor"),
            vendor,
        )
        row = get_object_or_404(rows, pk=pk)
        return Response(VendorQuoteRequestPortalSerializer(row, context={"vendor": vendor}).data)


class VendorSelfQuoteSubmitView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsVendor]

    def post(self, request, pk: int):
        vendor = Vendor.objects.filter(linked_user=request.user).first()
        if vendor is None:
            return Response({"detail": "No vendor profile linked."}, status=status.HTTP_404_NOT_FOUND)
        rows = vendor_quote_request_visible_to_vendor(VendorQuoteRequest.objects.all(), vendor)
        req_row = get_object_or_404(rows, pk=pk)
        if req_row.status not in ("SENT", "QUOTING", "PARTIALLY_QUOTED"):
            return Response(
                {"detail": "Quotes cannot be edited for this request in its current state."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        quote = VendorQuote.objects.filter(quote_request_id=req_row.id, vendor=vendor).first()
        if quote is None:
            return Response({"detail": "No quote assignment exists for your vendor."}, status=status.HTTP_404_NOT_FOUND)

        try:
            mark_vendor_quote_submitted(vendor_quote=quote, payload=dict(request.data), submitted_by=request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        quote.refresh_from_db()
        return Response(VendorQuoteSerializer(quote).data, status=status.HTTP_200_OK)


class VendorSelfProductsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsVendor]

    def get(self, request):
        vendor = Vendor.objects.filter(linked_user=request.user).first()
        if vendor is None:
            return Response({"count": 0, "results": []})
        rows = vendor.products.order_by("product_name", "id")
        return Response({"count": rows.count(), "results": VendorProductSerializer(rows, many=True).data})

    def post(self, request):
        vendor = Vendor.objects.filter(linked_user=request.user).first()
        if vendor is None:
            return Response({"detail": "No vendor profile linked."}, status=status.HTTP_404_NOT_FOUND)
        payload = dict(request.data)
        payload["vendor"] = vendor.id
        serializer = VendorProductSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        row = serializer.save()
        return Response(VendorProductSerializer(row).data, status=status.HTTP_201_CREATED)


class VendorSelfPurchaseOrdersView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsVendor]

    def get(self, request):
        vendor = Vendor.objects.filter(linked_user=request.user).first()
        if vendor is None:
            return Response({"count": 0, "results": []})
        payload = get_vendor_purchase_summary(vendor)
        return Response(
            {
                "count": payload["purchase_orders_count"],
                "results": payload["purchase_orders"],
                "purchase_bills": payload["purchase_bills"],
                "vendor_payments": payload["vendor_payments"],
                "summary": payload["summary"],
            }
        )


class VendorSelfPurchaseReturnsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsVendor]

    def get(self, request):
        vendor = Vendor.objects.filter(linked_user=request.user).first()
        if vendor is None:
            return Response({"count": 0, "results": []})
        return Response(get_vendor_return_summary(vendor))
