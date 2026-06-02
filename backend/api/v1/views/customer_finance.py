from __future__ import annotations

from decimal import Decimal

from django.http import HttpResponse
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsCustomer
from api.v1.serializers.billing import (
    CustomerDirectSaleDetailSerializer,
    CustomerDirectSaleListSerializer,
    CustomerDirectSaleSummarySerializer,
)
from billing.models import BillingDocumentStatus, BillingInvoice, DirectSale, ReceiptDocument
from core.services.operational_visibility import INACTIVE_DIRECT_SALE_STATUSES
from subscriptions.models import (
    PlanType,
    RentLeaseBillingDemand,
    RentLeaseDemandType,
    RentLeaseReturnInspection,
    Subscription,
)
from subscriptions.services.phase4_finance_service import (
    FinanceFilter,
    customer_account_statement,
    customer_document_list,
    customer_finance_summary,
    customer_invoice_list,
    customer_payment_schedule,
    customer_receipt_list,
)
from subscriptions.services.document_pdf_service import (
    render_invoice_pdf,
    render_lease_contract_pdf,
    render_receipt_pdf,
    render_rent_contract_pdf,
    render_return_inspection_pdf,
    render_security_deposit_pdf,
)


def _customer_or_404(request):
    return getattr(request.user, "customer_profile", None)


def _customer_missing_response():
    return Response({"detail": "Customer profile missing."}, status=status.HTTP_404_NOT_FOUND)


def _direct_sale_queryset_for_customer(customer):
    return (
        DirectSale.objects.select_related("customer")
        .prefetch_related("lines", "billing_invoices", "receipts", "receipts__payment")
        .filter(customer=customer)
        .order_by("-sale_date", "-id")
    )


def _attach_customer_direct_sale_context(rows):
    for sale in rows:
        sale._customer_lines = list(sale.lines.all())
        sale._customer_invoice = sale.billing_invoices.order_by("-id").first()
        sale._customer_receipts = list(sale.receipts.order_by("-receipt_date", "-id"))
    return rows


def _direct_sale_outstanding_amount(sale: DirectSale) -> Decimal:
    outstanding = Decimal(str(sale.grand_total or "0.00")) - Decimal(str(sale.received_total or "0.00"))
    if outstanding < Decimal("0.00"):
        return Decimal("0.00")
    return outstanding.quantize(Decimal("0.01"))


class CustomerFinanceSummaryView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        customer = _customer_or_404(request)
        if customer is None:
            return _customer_missing_response()
        return Response(customer_finance_summary(customer=customer))


class CustomerInvoiceListView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        customer = _customer_or_404(request)
        if customer is None:
            return _customer_missing_response()
        return Response(customer_invoice_list(customer=customer))


class CustomerInvoicePdfView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request, pk: int):
        customer = _customer_or_404(request)
        if customer is None:
            return _customer_missing_response()
        invoice = (
            BillingInvoice.objects.select_related("customer", "direct_sale")
            .filter(pk=pk, customer=customer)
            .first()
        )
        if invoice is None:
            return Response({"detail": "Invoice not found."}, status=status.HTTP_404_NOT_FOUND)
        pdf_bytes = render_invoice_pdf(invoice=invoice)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="invoice-{invoice.document_no or invoice.id}.pdf"'
        return response


class CustomerRentContractPdfView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request, pk: int):
        customer = _customer_or_404(request)
        if customer is None:
            return _customer_missing_response()
        subscription = (
            Subscription.objects.select_related("customer", "product", "rent_profile")
            .filter(pk=pk, customer=customer, plan_type=PlanType.RENT)
            .first()
        )
        if subscription is None or not hasattr(subscription, "rent_profile"):
            return Response({"detail": "Rent contract not found."}, status=status.HTTP_404_NOT_FOUND)
        pdf_bytes = render_rent_contract_pdf(contract=subscription.rent_profile)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="rent-contract-{subscription.id}.pdf"'
        return response


class CustomerLeaseContractPdfView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request, pk: int):
        customer = _customer_or_404(request)
        if customer is None:
            return _customer_missing_response()
        subscription = (
            Subscription.objects.select_related("customer", "product", "lease_profile")
            .filter(pk=pk, customer=customer, plan_type=PlanType.LEASE)
            .first()
        )
        if subscription is None or not hasattr(subscription, "lease_profile"):
            return Response({"detail": "Lease contract not found."}, status=status.HTTP_404_NOT_FOUND)
        pdf_bytes = render_lease_contract_pdf(contract=subscription.lease_profile)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="lease-contract-{subscription.id}.pdf"'
        return response


class CustomerDepositPdfView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request, pk: int):
        customer = _customer_or_404(request)
        if customer is None:
            return _customer_missing_response()
        demand = (
            RentLeaseBillingDemand.objects.select_related("subscription", "subscription__customer", "subscription__product")
            .filter(pk=pk, subscription__customer=customer, demand_type=RentLeaseDemandType.SECURITY_DEPOSIT)
            .first()
        )
        if demand is None:
            return Response({"detail": "Deposit record not found."}, status=status.HTTP_404_NOT_FOUND)
        pdf_bytes = render_security_deposit_pdf(deposit_or_contract=demand)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="deposit-{demand.reference_key or demand.id}.pdf"'
        return response


class CustomerReturnInspectionPdfView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request, pk: int):
        customer = _customer_or_404(request)
        if customer is None:
            return _customer_missing_response()
        inspection = (
            RentLeaseReturnInspection.objects.select_related("subscription", "subscription__customer")
            .filter(pk=pk, subscription__customer=customer)
            .first()
        )
        if inspection is None:
            return Response({"detail": "Return inspection not found."}, status=status.HTTP_404_NOT_FOUND)
        pdf_bytes = render_return_inspection_pdf(return_or_inspection_record=inspection)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="return-inspection-{inspection.id}.pdf"'
        return response


class CustomerReceiptListView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        customer = _customer_or_404(request)
        if customer is None:
            return _customer_missing_response()
        return Response(customer_receipt_list(customer=customer))


class CustomerReceiptPdfView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request, pk: int):
        customer = _customer_or_404(request)
        if customer is None:
            return _customer_missing_response()
        receipt = (
            ReceiptDocument.objects.select_related("customer", "finance_account", "payment")
            .filter(pk=pk, customer=customer)
            .first()
        )
        if receipt is None:
            return Response({"detail": "Receipt not found."}, status=status.HTTP_404_NOT_FOUND)
        pdf_bytes = render_receipt_pdf(receipt=receipt)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="receipt-{receipt.receipt_no or receipt.id}.pdf"'
        return response


class CustomerDocumentListView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        customer = _customer_or_404(request)
        if customer is None:
            return _customer_missing_response()
        return Response(customer_document_list(customer=customer))


class CustomerPaymentScheduleView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        customer = _customer_or_404(request)
        if customer is None:
            return _customer_missing_response()
        return Response(customer_payment_schedule(customer=customer))


class CustomerAccountStatementView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        customer = _customer_or_404(request)
        if customer is None:
            return _customer_missing_response()
        flt = FinanceFilter.from_query_params(request.query_params)
        return Response(customer_account_statement(customer=customer, flt=flt))


class CustomerDirectSaleListView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        customer = _customer_or_404(request)
        if customer is None:
            return _customer_missing_response()
        queryset = _direct_sale_queryset_for_customer(customer)
        status_filter = (request.query_params.get("status") or "").strip().upper()
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        rows = _attach_customer_direct_sale_context(list(queryset[:200]))
        return Response(
            {
                "count": queryset.count(),
                "results": CustomerDirectSaleListSerializer(rows, many=True, context={"request": request}).data,
            }
        )


class CustomerDirectSaleDetailView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request, pk: int):
        customer = _customer_or_404(request)
        if customer is None:
            return _customer_missing_response()
        sale = _direct_sale_queryset_for_customer(customer).filter(pk=pk).first()
        if sale is None:
            return Response({"detail": "Direct sale not found."}, status=status.HTTP_404_NOT_FOUND)
        _attach_customer_direct_sale_context([sale])
        return Response(CustomerDirectSaleDetailSerializer(sale, context={"request": request}).data)


class CustomerDirectSaleSummaryView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        customer = _customer_or_404(request)
        if customer is None:
            return _customer_missing_response()
        queryset = _direct_sale_queryset_for_customer(customer).exclude(status__in=INACTIVE_DIRECT_SALE_STATUSES)
        latest = queryset.first()
        latest_payload = None
        if latest is not None:
            _attach_customer_direct_sale_context([latest])
            latest_payload = CustomerDirectSaleListSerializer(latest, context={"request": request}).data
        payload = {
            "total_direct_sale_invoices": queryset.count(),
            "total_outstanding_direct_sale_dues": sum((_direct_sale_outstanding_amount(row) for row in queryset), Decimal("0.00")),
            "total_paid_direct_sale_amount": sum((Decimal(str(row.received_total or "0.00")) for row in queryset), Decimal("0.00")),
            "overdue_direct_sale_count": 0,
            "latest_direct_sale_invoice": latest_payload,
        }
        return Response(CustomerDirectSaleSummarySerializer(payload).data)
