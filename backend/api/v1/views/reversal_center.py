from __future__ import annotations

from django.core.exceptions import ObjectDoesNotExist, ValidationError as DjangoValidationError
from django.db.models import Q, Sum
from rest_framework import permissions, serializers, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.reversal_center import (
    CustomerRefundCreateSerializer,
    DirectSaleExchangeCreateSerializer,
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
    create_direct_sale_exchange,
    create_direct_sale_return,
    create_purchase_return,
    get_direct_sale_return_eligibility,
    finalize_direct_sale_reversal,
    open_direct_sale_cancellation_case,
    pay_customer_refund,
    post_direct_sale_return,
    post_purchase_return,
    void_receipt_with_reason,
)


class _AdminBase(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


def _as_drf_validation_error(exc: Exception) -> ValidationError:
    if isinstance(exc, DjangoValidationError) and hasattr(exc, "message_dict"):
        return ValidationError(exc.message_dict)
    return ValidationError({"detail": str(exc)})


class AdminDirectSaleCancelView(_AdminBase):
    def post(self, request, pk: int):
        if pk <= 0:
            raise ValidationError({"direct_sale_id": ["Direct sale id is required."]})
        serializer = ReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = open_direct_sale_cancellation_case(
                direct_sale_id=pk,
                reason=serializer.validated_data["reason"],
                performed_by=request.user,
                stock_location_id=serializer.validated_data.get("stock_location_id"),
            )
        except ObjectDoesNotExist as exc:
            raise ValidationError({"direct_sale_id": ["Direct sale not found."]}) from exc
        except (ValueError, DjangoValidationError) as exc:
            raise _as_drf_validation_error(exc) from exc
        return Response(result)


class _ReasonConfirmSerializer(ReasonSerializer):
    confirm = serializers.BooleanField(default=False)


class AdminDirectSaleFinalizeReversalView(_AdminBase):
    def post(self, request, pk: int):
        if pk <= 0:
            raise ValidationError({"direct_sale_id": ["Direct sale id is required."]})
        serializer = _ReasonConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = finalize_direct_sale_reversal(
                direct_sale_id=pk,
                reason=serializer.validated_data["reason"],
                confirm=bool(serializer.validated_data.get("confirm")),
                performed_by=request.user,
            )
        except ObjectDoesNotExist as exc:
            raise ValidationError({"direct_sale_id": ["Direct sale not found."]}) from exc
        except (ValueError, DjangoValidationError) as exc:
            raise _as_drf_validation_error(exc) from exc
        eligibility = get_direct_sale_return_eligibility(direct_sale_id=pk)
        return Response({"result": result, "eligibility": eligibility})


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
                return_kind=serializer.validated_data.get("return_kind"),
                stock_destination=serializer.validated_data.get("stock_destination"),
                stock_location_id=serializer.validated_data.get("stock_location_id"),
                confirm_sellable_destination=serializer.validated_data.get("confirm_sellable_destination", False),
            )
        except (ValueError, ObjectDoesNotExist, DjangoValidationError) as exc:
            raise _as_drf_validation_error(exc) from exc
        return Response(
            {
                "direct_sale_return_id": ret.id,
                "return_id": ret.id,
                "return_no": ret.return_no,
                "status": ret.status,
                "stock_movement_refs": [],
                "eligibility": get_direct_sale_return_eligibility(direct_sale_id=pk),
                "updated_returned_quantity": {},
                "updated_returnable_quantity": {},
            },
            status=status.HTTP_201_CREATED,
        )


class AdminDirectSaleExchangeCreateView(_AdminBase):
    def post(self, request, pk: int):
        serializer = DirectSaleExchangeCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            ret = create_direct_sale_exchange(
                direct_sale_id=pk,
                returned_lines=serializer.validated_data["returned_lines"],
                replacement_lines=serializer.validated_data["replacement_lines"],
                reason=serializer.validated_data["reason"],
                performed_by=request.user,
                stock_destination=serializer.validated_data.get("stock_destination"),
                stock_location_id=serializer.validated_data.get("stock_location_id"),
                confirm_sellable_destination=serializer.validated_data.get("confirm_sellable_destination", False),
            )
        except (ValueError, ObjectDoesNotExist, DjangoValidationError) as exc:
            raise _as_drf_validation_error(exc) from exc
        return Response(
            {
                "direct_sale_return_id": ret.id,
                "return_no": ret.return_no,
                "status": ret.status,
                "exchange_amount_due": str(ret.exchange_amount_due),
                "exchange_customer_credit": str(ret.exchange_customer_credit),
            },
            status=status.HTTP_201_CREATED,
        )


class AdminDirectSaleReturnEligibilityView(_AdminBase):
    def get(self, request, pk: int):
        replacement_inventory_item_id = request.query_params.get("replacement_inventory_item_id")
        replacement_stock_location_id = request.query_params.get("replacement_stock_location_id")
        replacement_quantity = request.query_params.get("replacement_quantity")
        return Response(
            get_direct_sale_return_eligibility(
                direct_sale_id=pk,
                replacement_inventory_item_id=int(replacement_inventory_item_id) if replacement_inventory_item_id else None,
                replacement_stock_location_id=int(replacement_stock_location_id) if replacement_stock_location_id else None,
                replacement_quantity=replacement_quantity,
            )
        )


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
        except (ValueError, ObjectDoesNotExist, DjangoValidationError) as exc:
            raise _as_drf_validation_error(exc) from exc
        return Response({"updated": updated, "id": ret.id, "status": ret.status})


class AdminReturnPostView(_AdminBase):
    def post(self, request, pk: int):
        try:
            ret, updated = post_direct_sale_return(return_id=pk, posted_by=request.user)
        except (ValueError, ObjectDoesNotExist, DjangoValidationError) as exc:
            raise _as_drf_validation_error(exc) from exc
        stock_refs = list(
            ret.lines.values_list("id", flat=True)
        )
        eligibility = get_direct_sale_return_eligibility(direct_sale_id=ret.direct_sale_id)
        return Response(
            {
                "updated": updated,
                "id": ret.id,
                "return_id": ret.id,
                "status": ret.status,
                "credit_note_id": ret.credit_note_id,
                "stock_movement_refs": [f"{ret.id}:{line_id}" for line_id in stock_refs],
                "eligibility": eligibility,
                "updated_returned_quantity": eligibility.get("already_returned_quantities", {}),
                "updated_returnable_quantity": eligibility.get("returnable_quantities", {}),
            }
        )


class AdminReceiptVoidReasonView(_AdminBase):
    def post(self, request, pk: int):
        from api.v1.serializers.billing import BillingInvoiceSerializer, DirectSaleSerializer

        serializer = ReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            receipt, updated = void_receipt_with_reason(receipt_id=pk, reason=serializer.validated_data["reason"], performed_by=request.user)
        except (ValueError, ObjectDoesNotExist, DjangoValidationError) as exc:
            raise _as_drf_validation_error(exc) from exc
        invoice = receipt.billing_invoice if receipt.billing_invoice_id else None
        direct_sale = receipt.direct_sale if receipt.direct_sale_id else None
        return Response(
            {
                "updated": updated,
                "id": receipt.id,
                "status": receipt.status,
                "invoice": BillingInvoiceSerializer(invoice, context={"request": request}).data if invoice else None,
                "direct_sale": DirectSaleSerializer(direct_sale, context={"request": request}).data if direct_sale else None,
                "return_eligibility": get_direct_sale_return_eligibility(direct_sale_id=direct_sale.id) if direct_sale else None,
            }
        )


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
        except (ValueError, ObjectDoesNotExist, DjangoValidationError) as exc:
            raise _as_drf_validation_error(exc) from exc
        return Response({"id": refund.id, "refund_no": refund.refund_no, "status": refund.status}, status=status.HTTP_201_CREATED)


class AdminCustomerRefundApproveView(_AdminBase):
    def post(self, request, pk: int):
        try:
            refund, updated = approve_customer_refund(refund_id=pk, performed_by=request.user)
        except (ValueError, ObjectDoesNotExist, DjangoValidationError) as exc:
            raise _as_drf_validation_error(exc) from exc
        return Response({"updated": updated, "id": refund.id, "status": refund.status})


class AdminCustomerRefundPayView(_AdminBase):
    def post(self, request, pk: int):
        try:
            refund, updated = pay_customer_refund(refund_id=pk, paid_by=request.user)
        except (ValueError, ObjectDoesNotExist, DjangoValidationError) as exc:
            raise _as_drf_validation_error(exc) from exc
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
                stock_location_id=serializer.validated_data.get("stock_location_id"),
            )
        except (ValueError, ObjectDoesNotExist, DjangoValidationError) as exc:
            raise _as_drf_validation_error(exc) from exc
        return Response({"id": purchase_return.id, "return_no": purchase_return.return_no, "status": purchase_return.status}, status=status.HTTP_201_CREATED)


class AdminPurchaseReturnPostView(_AdminBase):
    def post(self, request, pk: int):
        try:
            purchase_return, updated = post_purchase_return(purchase_return_id=pk, posted_by=request.user)
        except (ValueError, ObjectDoesNotExist, DjangoValidationError) as exc:
            raise _as_drf_validation_error(exc) from exc
        return Response({"updated": updated, "id": purchase_return.id, "status": purchase_return.status})
