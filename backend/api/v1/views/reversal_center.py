from __future__ import annotations

from django.db.models import Q, Sum
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.reversal_center import (
    CustomerRefundCreateSerializer,
    DirectSaleReturnCreateSerializer,
    PurchaseReturnCreateSerializer,
    ReasonSerializer,
    ReversalListFilterSerializer,
)
from billing.models import CustomerCreditLedger, CustomerRefund, DirectSaleReturn, PurchaseReturn, ReceiptDocument
from billing.services.reversal_service import (
    approve_customer_refund,
    approve_direct_sale_return,
    cancel_direct_sale_before_invoice,
    create_customer_refund,
    create_direct_sale_return,
    create_purchase_return,
    pay_customer_refund,
    post_direct_sale_return,
    post_purchase_return,
    void_receipt_with_reason,
)


class _AdminBase(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class AdminDirectSaleCancelView(_AdminBase):
    def post(self, request, pk: int):
        serializer = ReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            sale, updated = cancel_direct_sale_before_invoice(
                direct_sale_id=pk,
                reason=serializer.validated_data["reason"],
                performed_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response({"updated": updated, "direct_sale_id": sale.id, "status": sale.status})


class AdminDirectSaleReturnCreateView(_AdminBase):
    def post(self, request, pk: int):
        serializer = DirectSaleReturnCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            ret = create_direct_sale_return(
                direct_sale_id=pk,
                lines=serializer.validated_data["lines"],
                reason=serializer.validated_data["reason"],
                performed_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response({"direct_sale_return_id": ret.id, "return_no": ret.return_no, "status": ret.status}, status=status.HTTP_201_CREATED)


class AdminReturnListView(_AdminBase):
    def get(self, request):
        filters = ReversalListFilterSerializer(data=request.query_params)
        filters.is_valid(raise_exception=True)
        v = filters.validated_data

        rows = []

        ds_returns = DirectSaleReturn.objects.select_related("customer").all()
        receipt_voids = ReceiptDocument.objects.select_related("customer").filter(status="VOID")
        refunds = CustomerRefund.objects.select_related("customer").all()
        purchase_returns = PurchaseReturn.objects.select_related("vendor").all()

        if v.get("status"):
            ds_returns = ds_returns.filter(status=v["status"])
            refunds = refunds.filter(status=v["status"])
            purchase_returns = purchase_returns.filter(status=v["status"])
        if v.get("customer"):
            ds_returns = ds_returns.filter(customer_id=v["customer"])
            receipt_voids = receipt_voids.filter(customer_id=v["customer"])
            refunds = refunds.filter(customer_id=v["customer"])
        if v.get("vendor"):
            purchase_returns = purchase_returns.filter(vendor_id=v["vendor"])
        if v.get("date_from"):
            ds_returns = ds_returns.filter(created_at__date__gte=v["date_from"])
            receipt_voids = receipt_voids.filter(updated_at__date__gte=v["date_from"])
            refunds = refunds.filter(created_at__date__gte=v["date_from"])
            purchase_returns = purchase_returns.filter(return_date__gte=v["date_from"])
        if v.get("date_to"):
            ds_returns = ds_returns.filter(created_at__date__lte=v["date_to"])
            receipt_voids = receipt_voids.filter(updated_at__date__lte=v["date_to"])
            refunds = refunds.filter(created_at__date__lte=v["date_to"])
            purchase_returns = purchase_returns.filter(return_date__lte=v["date_to"])

        if v.get("reference"):
            ref = v["reference"].strip()
            ds_returns = ds_returns.filter(Q(return_no__icontains=ref) | Q(reason__icontains=ref))
            receipt_voids = receipt_voids.filter(Q(receipt_no__icontains=ref) | Q(notes__icontains=ref))
            refunds = refunds.filter(Q(refund_no__icontains=ref) | Q(reason__icontains=ref))
            purchase_returns = purchase_returns.filter(Q(return_no__icontains=ref) | Q(reason__icontains=ref))

        for row in ds_returns[:200]:
            rows.append({"id": row.id, "type": "sale_return", "status": row.status, "reference_no": row.return_no, "amount": str(row.grand_total), "customer_id": row.customer_id, "date": row.created_at.date().isoformat()})
        for row in receipt_voids[:200]:
            rows.append({"id": row.id, "type": "receipt_void", "status": row.status, "reference_no": row.receipt_no, "amount": str(row.amount), "customer_id": row.customer_id, "date": row.updated_at.date().isoformat()})
        for row in refunds[:200]:
            rows.append({"id": row.id, "type": "customer_refund", "status": row.status, "reference_no": row.refund_no, "amount": str(row.amount), "customer_id": row.customer_id, "date": row.created_at.date().isoformat()})
        for row in purchase_returns[:200]:
            rows.append({"id": row.id, "type": "purchase_return", "status": row.status, "reference_no": row.return_no, "amount": str(row.grand_total), "vendor_id": row.vendor_id, "date": row.return_date.isoformat()})

        t = v.get("type")
        if t:
            rows = [r for r in rows if r["type"] == t]

        if v.get("amount_min") is not None:
            rows = [r for r in rows if float(r["amount"]) >= float(v["amount_min"])]
        if v.get("amount_max") is not None:
            rows = [r for r in rows if float(r["amount"]) <= float(v["amount_max"])]

        rows.sort(key=lambda x: (x["date"], x["id"]), reverse=True)
        return Response({"count": len(rows), "results": rows})


class AdminReturnDetailView(_AdminBase):
    def get(self, request, pk: int):
        ret = DirectSaleReturn.objects.filter(pk=pk).first()
        if ret is not None:
            return Response(
                {
                    "id": ret.id,
                    "type": "sale_return",
                    "status": ret.status,
                    "reference_no": ret.return_no,
                    "amount": str(ret.grand_total),
                    "reason": ret.reason,
                    "credit_note_id": ret.credit_note_id,
                }
            )
        purchase_ret = PurchaseReturn.objects.filter(pk=pk).first()
        if purchase_ret is not None:
            return Response(
                {
                    "id": purchase_ret.id,
                    "type": "purchase_return",
                    "status": purchase_ret.status,
                    "reference_no": purchase_ret.return_no,
                    "amount": str(purchase_ret.grand_total),
                    "reason": purchase_ret.reason,
                }
            )
        return Response({"detail": "Return not found."}, status=status.HTTP_404_NOT_FOUND)


class AdminReturnApproveView(_AdminBase):
    def post(self, request, pk: int):
        try:
            ret, updated = approve_direct_sale_return(return_id=pk, performed_by=request.user)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response({"updated": updated, "id": ret.id, "status": ret.status})


class AdminReturnPostView(_AdminBase):
    def post(self, request, pk: int):
        try:
            ret, updated = post_direct_sale_return(return_id=pk, posted_by=request.user)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response({"updated": updated, "id": ret.id, "status": ret.status, "credit_note_id": ret.credit_note_id})


class AdminReceiptVoidReasonView(_AdminBase):
    def post(self, request, pk: int):
        serializer = ReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            receipt, updated = void_receipt_with_reason(receipt_id=pk, reason=serializer.validated_data["reason"], performed_by=request.user)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response({"updated": updated, "id": receipt.id, "status": receipt.status})


class AdminCustomerCreditsView(_AdminBase):
    def get(self, request, pk: int):
        rows = CustomerCreditLedger.objects.filter(customer_id=pk).order_by("entry_date", "id")
        totals = rows.aggregate(credit_total=Sum("credit_amount"), debit_total=Sum("debit_amount"))
        return Response(
            {
                "customer_id": pk,
                "credit_total": str(totals.get("credit_total") or "0.00"),
                "debit_total": str(totals.get("debit_total") or "0.00"),
                "balance": str((totals.get("credit_total") or 0) - (totals.get("debit_total") or 0)),
                "results": [
                    {
                        "id": row.id,
                        "entry_date": row.entry_date.isoformat(),
                        "reference_no": row.reference_no,
                        "credit_amount": str(row.credit_amount),
                        "debit_amount": str(row.debit_amount),
                        "notes": row.notes,
                    }
                    for row in rows
                ],
            }
        )


class AdminCustomerRefundCreateView(_AdminBase):
    def post(self, request, pk: int):
        serializer = CustomerRefundCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            refund = create_customer_refund(customer_id=pk, performed_by=request.user, **serializer.validated_data)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response({"id": refund.id, "refund_no": refund.refund_no, "status": refund.status}, status=status.HTTP_201_CREATED)


class AdminCustomerRefundApproveView(_AdminBase):
    def post(self, request, pk: int):
        try:
            refund, updated = approve_customer_refund(refund_id=pk, performed_by=request.user)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response({"updated": updated, "id": refund.id, "status": refund.status})


class AdminCustomerRefundPayView(_AdminBase):
    def post(self, request, pk: int):
        try:
            refund, updated = pay_customer_refund(refund_id=pk, paid_by=request.user)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response({"updated": updated, "id": refund.id, "status": refund.status})


class AdminPurchaseReturnCreateView(_AdminBase):
    def post(self, request, pk: int):
        serializer = PurchaseReturnCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            purchase_return = create_purchase_return(
                purchase_bill_id=pk,
                lines=serializer.validated_data["lines"],
                reason=serializer.validated_data["reason"],
                performed_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response({"id": purchase_return.id, "return_no": purchase_return.return_no, "status": purchase_return.status}, status=status.HTTP_201_CREATED)


class AdminPurchaseReturnPostView(_AdminBase):
    def post(self, request, pk: int):
        try:
            purchase_return, updated = post_purchase_return(purchase_return_id=pk, posted_by=request.user)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response({"updated": updated, "id": purchase_return.id, "status": purchase_return.status})
