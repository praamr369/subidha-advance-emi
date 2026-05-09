from __future__ import annotations

import hashlib
import json

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.billing import DirectSaleSerializer
from billing.models import DirectSale
from billing.services.direct_sale_workflow_service import (
    build_direct_sale_workflow_payload,
    classify_direct_sale_stock_status,
)
from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit
from subscriptions.services.document_numbering_service import get_document_numbering_state


class _AdminBase(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class AdminSalesDirectSaleListCreateView(_AdminBase):
    def get(self, request):
        qs = DirectSale.objects.select_related(
            "customer",
            "doc_series",
            "finance_account",
            "confirmed_by",
        ).prefetch_related("lines", "billing_invoices").order_by("-sale_date", "-created_at", "-id")
        cid = request.query_params.get("customer")
        if cid:
            qs = qs.filter(customer_id=cid)
        try:
            limit = min(max(int(request.query_params.get("limit", "40")), 1), 200)
        except ValueError:
            limit = 40
        sliced = qs[:limit]
        return Response(
            {
                "count": qs.count(),
                "results": DirectSaleSerializer(sliced, many=True, context={"request": request}).data,
            }
        )

    def _idempotency_key(self, request):
        return (
            request.headers.get("Idempotency-Key")
            or request.headers.get("X-Idempotency-Key")
            or ""
        ).strip()

    def _request_payload_hash(self, request):
        payload = json.dumps(request.data, sort_keys=True, default=str, separators=(",", ":"))
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    @transaction.atomic
    def post(self, request):
        numbering = get_document_numbering_state()
        if not numbering["checks"]["direct_sale_invoice_numbering_configured"]:
            raise ValidationError(
                {
                    "detail": "Direct sale invoice numbering is not configured. Complete Admin Settings -> Document Numbering.",
                    "numbering_key": "DIRECT_SALE_INVOICE",
                }
            )

        idempotency_key = self._idempotency_key(request)
        payload_hash = self._request_payload_hash(request) if idempotency_key else ""

        if idempotency_key:
            sale = DirectSale.objects.filter(idempotency_key=idempotency_key).first()
            if sale:
                if sale.idempotency_payload_hash != payload_hash:
                    return Response(
                        {"detail": "Idempotency-Key was already used with a different direct-sale payload."},
                        status=status.HTTP_409_CONFLICT,
                    )
                sale_payload = DirectSaleSerializer(sale, context={"request": request}).data
                return Response(
                    build_direct_sale_workflow_payload(sale=sale, sale_data=sale_payload),
                    status=status.HTTP_200_OK,
                )

        serializer = DirectSaleSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        save_kwargs = (
            {"idempotency_key": idempotency_key, "idempotency_payload_hash": payload_hash}
            if idempotency_key
            else {}
        )

        try:
            sale = serializer.save(**save_kwargs)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        except DjangoValidationError as exc:
            if getattr(exc, "message_dict", None):
                raise ValidationError(exc.message_dict) from exc
            if getattr(exc, "messages", None):
                raise ValidationError({"detail": exc.messages}) from exc
            raise ValidationError({"detail": str(exc)}) from exc
        except IntegrityError:
            if idempotency_key:
                sale = DirectSale.objects.filter(idempotency_key=idempotency_key).first()
                if sale and sale.idempotency_payload_hash == payload_hash:
                    sale_payload = DirectSaleSerializer(sale, context={"request": request}).data
                    return Response(
                        build_direct_sale_workflow_payload(sale=sale, sale_data=sale_payload),
                        status=status.HTTP_200_OK,
                    )
            raise

        sale_payload = DirectSaleSerializer(sale, context={"request": request}).data
        agg_status, _, extra_warnings = classify_direct_sale_stock_status(sale=sale)
        composite = build_direct_sale_workflow_payload(sale=sale, sale_data=sale_payload)

        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=sale,
            performed_by=request.user,
            metadata={
                "event": "ADMIN_DIRECT_SALE_WORKFLOW_CREATED",
                "direct_sale_id": sale.id,
                "sale_no": sale.sale_no,
                "aggregate_stock_status": agg_status,
                "delivery_required": sale.delivery_required,
                "warnings": composite.get("warnings") or [],
            },
        )

        composite["warnings"] = list(dict.fromkeys([*(composite.get("warnings") or []), *extra_warnings]))
        return Response(composite, status=status.HTTP_201_CREATED)


class AdminSalesDirectSaleDetailView(_AdminBase):
    def get(self, request, pk):
        sale = (
            DirectSale.objects.select_related("customer", "doc_series", "finance_account")
            .prefetch_related("lines__product", "lines__inventory_item", "billing_invoices")
            .filter(pk=pk)
            .first()
        )
        if sale is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        sale_payload = DirectSaleSerializer(sale, context={"request": request}).data
        composite = build_direct_sale_workflow_payload(sale=sale, sale_data=sale_payload)
        return Response(composite)
