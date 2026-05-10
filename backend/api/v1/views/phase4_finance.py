from __future__ import annotations

from decimal import Decimal

from django.http import HttpResponse
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin, IsCustomer, IsPartner
from api.v1.serializers.billing import (
    CustomerDirectSaleDetailSerializer,
    CustomerDirectSaleListSerializer,
    CustomerDirectSaleSummarySerializer,
)
from accounting.models import ChartOfAccount, FinanceAccount, RentLeaseAccountingAccountMapping
from billing.models import BillingDocumentStatus, BillingInvoice, DirectSale, ReceiptDocument
from core.services.operational_visibility import INACTIVE_DIRECT_SALE_STATUSES
from subscriptions.models import (
    PlanType,
    RentLeaseBillingDemand,
    RentLeaseDemandType,
    RentLeaseReturnInspection,
    Subscription,
    SubscriptionDocument,
)
from subscriptions.services.audit_service import log_audit
from subscriptions.services.contract_pdf_service import (
    generate_advance_emi_contract_pdf,
    generate_contract_pdf_for_subscription,
)
from subscriptions.services.phase4_finance_service import (
    FinanceFilter,
    build_admin_finance_dashboard,
    customer_account_statement,
    customer_document_list,
    customer_finance_summary,
    customer_invoice_list,
    customer_payment_schedule,
    customer_receipt_list,
    list_admin_documents,
    list_admin_invoices,
    list_admin_receipts,
    partner_finance_summary,
    partner_linked_customer_payments,
    partner_receipt_list,
    reconciliation_report,
    waiver_loss_report,
)
from subscriptions.services.document_pdf_service import (
    render_deposit_deduction_pdf,
    render_deposit_refund_pdf,
    render_invoice_pdf,
    render_lease_contract_pdf,
    render_receipt_pdf,
    render_rent_contract_pdf,
    render_return_inspection_pdf,
    render_security_deposit_pdf,
)
from subscriptions.services.rent_lease_billing_service import (
    list_admin_deposit_register,
    record_damage_deduction,
    approve_deposit_refund,
    record_deposit_refund,
)
from subscriptions.services.rent_lease_finance_sync_service import get_active_account_mapping


def _safe_customer_profile(request):
    return getattr(request.user, "customer_profile", None)


def _paginate_customer_queryset(request, queryset):
    page_raw = (request.query_params.get("page") or "1").strip()
    page_size_raw = (request.query_params.get("page_size") or "20").strip()
    page = int(page_raw) if page_raw.isdigit() and int(page_raw) > 0 else 1
    page_size = int(page_size_raw) if page_size_raw.isdigit() and int(page_size_raw) > 0 else 20
    page_size = min(page_size, 100)
    offset = (page - 1) * page_size
    total_count = queryset.count()
    return queryset[offset : offset + page_size], page, page_size, total_count


def _direct_sale_outstanding_amount(sale: DirectSale) -> Decimal:
    outstanding = Decimal(str(sale.grand_total or "0.00")) - Decimal(str(sale.received_total or "0.00"))
    if outstanding < Decimal("0.00"):
        return Decimal("0.00")
    return outstanding.quantize(Decimal("0.01"))


def _direct_sale_queryset_for_customer(customer):
    return (
        DirectSale.objects.select_related("customer")
        .prefetch_related("lines", "billing_invoices", "receipts")
        .filter(customer=customer)
        .order_by("-sale_date", "-id")
    )


class AdminFinanceDashboardView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        flt = FinanceFilter.from_query_params(request.query_params)
        return Response(build_admin_finance_dashboard(flt=flt))


class AdminFinanceCollectionsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        flt = FinanceFilter.from_query_params(request.query_params)
        return Response({"invoices": list_admin_invoices(flt=flt), "receipts": list_admin_receipts(flt=flt)})


class AdminFinanceDuesView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        flt = FinanceFilter.from_query_params(request.query_params)
        dashboard = build_admin_finance_dashboard(flt=flt)
        return Response(
            {
                "pending_dues": dashboard["cards"]["pending_dues"],
                "overdue_payments": dashboard["cards"]["overdue_payments"],
                "overdue_aging": dashboard["overdue_aging"],
            }
        )


class AdminFinanceOverdueView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        flt = FinanceFilter.from_query_params(request.query_params)
        dashboard = build_admin_finance_dashboard(flt=flt)
        return Response({"overdue_aging": dashboard["overdue_aging"]})


class AdminFinanceReconciliationView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        flt = FinanceFilter.from_query_params(request.query_params)
        return Response(reconciliation_report(flt=flt))


class AdminFinanceWaiverLossView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        flt = FinanceFilter.from_query_params(request.query_params)
        return Response(waiver_loss_report(flt=flt))


class AdminFinanceDepositRegisterView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        subscription_raw = (request.query_params.get("subscription_id") or "").strip()
        subscription_id = int(subscription_raw) if subscription_raw.isdigit() else None
        return Response(list_admin_deposit_register(subscription_id=subscription_id))


class AdminFinanceDepositPdfView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        demand = (
            RentLeaseBillingDemand.objects.select_related("subscription", "subscription__customer", "subscription__product")
            .filter(pk=pk, demand_type=RentLeaseDemandType.SECURITY_DEPOSIT)
            .first()
        )
        if demand is None:
            return Response({"detail": "Deposit record not found."}, status=status.HTTP_404_NOT_FOUND)
        pdf_bytes = render_security_deposit_pdf(deposit_or_contract=demand)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="deposit-{demand.reference_key}.pdf"'
        return response


class AdminFinanceDepositRefundPdfView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        demand = (
            RentLeaseBillingDemand.objects.select_related("subscription", "subscription__customer")
            .filter(pk=pk, demand_type=RentLeaseDemandType.SECURITY_DEPOSIT)
            .first()
        )
        if demand is None:
            return Response({"detail": "Deposit record not found."}, status=status.HTTP_404_NOT_FOUND)
        pdf_bytes = render_deposit_refund_pdf(refund_or_deposit_action=demand)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="deposit-refund-{demand.reference_key}.pdf"'
        return response


class AdminFinanceDepositDeductionPdfView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        demand = (
            RentLeaseBillingDemand.objects.select_related("subscription", "subscription__customer")
            .filter(pk=pk, demand_type=RentLeaseDemandType.SECURITY_DEPOSIT)
            .first()
        )
        if demand is None:
            return Response({"detail": "Deposit record not found."}, status=status.HTTP_404_NOT_FOUND)
        pdf_bytes = render_deposit_deduction_pdf(deduction_or_deposit_action=demand)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="deposit-deduction-{demand.reference_key}.pdf"'
        return response


class AdminFinanceDepositDeductionView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        subscription_id = int(request.data.get("subscription_id") or 0)
        amount = request.data.get("amount")
        reason = (request.data.get("reason") or "").strip()
        subscription = Subscription.objects.filter(pk=subscription_id).first()
        if subscription is None:
            return Response({"detail": "Subscription not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            demand = record_damage_deduction(
                subscription=subscription,
                amount=amount,
                reason=reason,
                performed_by=request.user,
            )
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {
                "detail": "Deposit deduction recorded.",
                "subscription_id": subscription.id,
                "reference_key": demand.reference_key,
                "deducted_amount": f"{demand.deducted_amount:.2f}",
                "refundable_amount": f"{demand.refundable_amount:.2f}",
            }
        )


class AdminFinanceDepositRefundApproveView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        subscription_id = int(request.data.get("subscription_id") or 0)
        amount = request.data.get("amount")
        subscription = Subscription.objects.filter(pk=subscription_id).first()
        if subscription is None:
            return Response({"detail": "Subscription not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            tx = approve_deposit_refund(
                subscription=subscription,
                amount=amount,
                approved_by=request.user,
            )
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {
                "detail": "Deposit refund approved.",
                "subscription_id": subscription.id,
                "transaction_id": tx.id,
                "approved_amount": f"{tx.amount:.2f}",
            }
        )


class AdminFinanceDepositRefundRecordView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        subscription_id = int(request.data.get("subscription_id") or 0)
        amount = request.data.get("amount")
        approval_transaction_id = request.data.get("approval_transaction_id")
        subscription = Subscription.objects.filter(pk=subscription_id).first()
        if subscription is None:
            return Response({"detail": "Subscription not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            demand = record_deposit_refund(
                subscription=subscription,
                amount=amount,
                performed_by=request.user,
                approval_transaction_id=int(approval_transaction_id) if str(approval_transaction_id or "").isdigit() else None,
            )
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {
                "detail": "Deposit refund recorded.",
                "subscription_id": subscription.id,
                "reference_key": demand.reference_key,
                "refundable_amount": f"{demand.refundable_amount:.2f}",
            }
        )


class AdminFinanceAccountMappingView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        mapping = get_active_account_mapping()
        return Response(
            {
                "mapping": None
                if mapping is None
                else {
                    "id": mapping.id,
                    "monthly_income_account_id": mapping.monthly_income_account_id,
                    "monthly_income_account_code": mapping.monthly_income_account.code,
                    "deposit_liability_account_id": mapping.deposit_liability_account_id,
                    "deposit_liability_account_code": mapping.deposit_liability_account.code,
                    "deposit_refund_account_id": mapping.deposit_refund_account_id,
                    "deposit_refund_account_code": mapping.deposit_refund_account.code,
                    "damage_recovery_income_account_id": mapping.damage_recovery_income_account_id,
                    "damage_recovery_income_account_code": mapping.damage_recovery_income_account.code,
                    "settlement_finance_account_id": mapping.settlement_finance_account_id,
                    "is_active": mapping.is_active,
                    "notes": mapping.notes,
                },
                "chart_accounts": [
                    {"id": row.id, "code": row.code, "name": row.name, "account_type": row.account_type}
                    for row in ChartOfAccount.objects.filter(is_active=True).order_by("code")[:500]
                ],
                "finance_accounts": [
                    {"id": row.id, "name": row.name, "kind": row.kind}
                    for row in FinanceAccount.objects.filter(is_active=True).order_by("name")[:200]
                ],
            }
        )

    def post(self, request):
        payload = request.data
        mapping = get_active_account_mapping()
        if mapping is None:
            mapping = RentLeaseAccountingAccountMapping(is_active=True)
        monthly_income_account_id = int(payload.get("monthly_income_account_id") or 0)
        deposit_liability_account_id = int(payload.get("deposit_liability_account_id") or 0)
        deposit_refund_account_id = int(payload.get("deposit_refund_account_id") or 0)
        damage_recovery_income_account_id = int(payload.get("damage_recovery_income_account_id") or 0)
        settlement_finance_account_id_raw = payload.get("settlement_finance_account_id")
        mapping.monthly_income_account = ChartOfAccount.objects.get(pk=monthly_income_account_id)
        mapping.deposit_liability_account = ChartOfAccount.objects.get(pk=deposit_liability_account_id)
        mapping.deposit_refund_account = ChartOfAccount.objects.get(pk=deposit_refund_account_id)
        mapping.damage_recovery_income_account = ChartOfAccount.objects.get(pk=damage_recovery_income_account_id)
        mapping.settlement_finance_account = (
            FinanceAccount.objects.get(pk=int(settlement_finance_account_id_raw))
            if str(settlement_finance_account_id_raw or "").isdigit()
            else None
        )
        mapping.notes = (payload.get("notes") or "").strip()
        mapping.is_active = True
        try:
            mapping.save()
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        log_audit(
            action_type="PAYMENT_FLAGGED",
            instance=mapping,
            performed_by=request.user,
            metadata={
                "event": "RENT_LEASE_ACCOUNT_MAPPING_UPDATED",
                "mapping_id": mapping.id,
            },
        )
        return Response({"detail": "Rent/lease account mapping saved.", "mapping_id": mapping.id})


class AdminInvoiceRegisterView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        flt = FinanceFilter.from_query_params(request.query_params)
        return Response(list_admin_invoices(flt=flt))


class AdminInvoicePdfView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        invoice = BillingInvoice.objects.select_related("customer", "direct_sale").filter(pk=pk).first()
        if invoice is None:
            return Response({"detail": "Invoice not found."}, status=status.HTTP_404_NOT_FOUND)
        pdf_bytes = render_invoice_pdf(invoice=invoice)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="invoice-{invoice.document_no or invoice.id}.pdf"'
        )
        return response


class AdminReceiptRegisterView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        flt = FinanceFilter.from_query_params(request.query_params)
        return Response(list_admin_receipts(flt=flt))


class AdminReceiptPdfView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        receipt = (
            ReceiptDocument.objects.select_related("customer", "finance_account", "payment")
            .filter(pk=pk)
            .first()
        )
        if receipt is None:
            return Response({"detail": "Receipt not found."}, status=status.HTTP_404_NOT_FOUND)
        pdf_bytes = render_receipt_pdf(receipt=receipt)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="receipt-{receipt.receipt_no or receipt.id}.pdf"'
        )
        return response


class AdminDocumentCenterView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        subscription_id_raw = (request.query_params.get("subscription") or "").strip()
        subscription_id = int(subscription_id_raw) if subscription_id_raw.isdigit() else None
        return Response(list_admin_documents(subscription_id=subscription_id))


class AdminDocumentRegenerateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        document = SubscriptionDocument.objects.select_related("subscription").filter(pk=pk).first()
        if document is None:
            return Response({"detail": "Document not found."}, status=status.HTTP_404_NOT_FOUND)

        subscription = document.subscription
        reason = (request.data.get("reason") or "").strip()

        try:
            if subscription.plan_type == "EMI":
                new_doc = generate_advance_emi_contract_pdf(
                    subscription=subscription,
                    performed_by=request.user,
                )
            elif subscription.plan_type in {"RENT", "LEASE"}:
                new_doc = generate_contract_pdf_for_subscription(
                    subscription=subscription,
                    performed_by=request.user,
                )
            else:
                return Response(
                    {"detail": "Regeneration is not supported for this document/plan type yet."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if reason:
            new_doc.regeneration_reason = reason
            new_doc.save(update_fields=["regeneration_reason", "updated_at"])

        log_audit(
            action_type="PAYMENT_FLAGGED",
            instance=subscription,
            performed_by=request.user,
            metadata={
                "event": "SUBSCRIPTION_DOCUMENT_REGENERATED",
                "old_document_id": document.id,
                "new_document_id": new_doc.id,
                "document_type": new_doc.document_type,
                "new_version": new_doc.document_version,
                "reason": reason,
            },
        )

        return Response(
            {
                "detail": "Document regenerated.",
                "document": {
                    "id": new_doc.id,
                    "document_type": new_doc.document_type,
                    "document_version": new_doc.document_version,
                    "file_url": new_doc.file.url if new_doc.file else None,
                    "regeneration_reason": new_doc.regeneration_reason,
                },
            }
        )


class AdminCustomerStatementView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        subscription = Subscription.objects.select_related("customer").filter(customer_id=pk).first()
        if subscription is None:
            return Response({"detail": "Customer not found."}, status=status.HTTP_404_NOT_FOUND)
        flt = FinanceFilter.from_query_params(request.query_params)
        return Response(customer_account_statement(customer=subscription.customer, flt=flt))


class CustomerFinanceSummaryView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        customer = getattr(request.user, "customer_profile", None)
        if customer is None:
            return Response({"detail": "Customer profile missing."}, status=status.HTTP_404_NOT_FOUND)
        return Response(customer_finance_summary(customer=customer))


class CustomerInvoiceListView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        customer = getattr(request.user, "customer_profile", None)
        if customer is None:
            return Response({"detail": "Customer profile missing."}, status=status.HTTP_404_NOT_FOUND)
        return Response(customer_invoice_list(customer=customer))


class CustomerInvoicePdfView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request, pk: int):
        customer = getattr(request.user, "customer_profile", None)
        if customer is None:
            return Response({"detail": "Customer profile missing."}, status=status.HTTP_404_NOT_FOUND)
        invoice = (
            BillingInvoice.objects.select_related("customer", "direct_sale")
            .filter(pk=pk, customer=customer)
            .first()
        )
        if invoice is None:
            return Response({"detail": "Invoice not found."}, status=status.HTTP_404_NOT_FOUND)
        pdf_bytes = render_invoice_pdf(invoice=invoice)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="invoice-{invoice.document_no or invoice.id}.pdf"'
        )
        return response


class CustomerRentContractPdfView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request, pk: int):
        customer = getattr(request.user, "customer_profile", None)
        if customer is None:
            return Response({"detail": "Customer profile missing."}, status=status.HTTP_404_NOT_FOUND)
        subscription = (
            Subscription.objects.select_related("customer", "product", "rent_profile")
            .filter(pk=pk, customer=customer, plan_type=PlanType.RENT)
            .first()
        )
        if subscription is None or not hasattr(subscription, "rent_profile"):
            return Response({"detail": "Rent contract not found."}, status=status.HTTP_404_NOT_FOUND)
        pdf_bytes = render_rent_contract_pdf(contract=subscription.rent_profile)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="rent-contract-{subscription.id}.pdf"'
        )
        return response


class CustomerLeaseContractPdfView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request, pk: int):
        customer = getattr(request.user, "customer_profile", None)
        if customer is None:
            return Response({"detail": "Customer profile missing."}, status=status.HTTP_404_NOT_FOUND)
        subscription = (
            Subscription.objects.select_related("customer", "product", "lease_profile")
            .filter(pk=pk, customer=customer, plan_type=PlanType.LEASE)
            .first()
        )
        if subscription is None or not hasattr(subscription, "lease_profile"):
            return Response({"detail": "Lease contract not found."}, status=status.HTTP_404_NOT_FOUND)
        pdf_bytes = render_lease_contract_pdf(contract=subscription.lease_profile)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="lease-contract-{subscription.id}.pdf"'
        )
        return response


class CustomerReceiptListView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        customer = getattr(request.user, "customer_profile", None)
        if customer is None:
            return Response({"detail": "Customer profile missing."}, status=status.HTTP_404_NOT_FOUND)
        return Response(customer_receipt_list(customer=customer))


class CustomerReceiptPdfView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request, pk: int):
        customer = getattr(request.user, "customer_profile", None)
        if customer is None:
            return Response({"detail": "Customer profile missing."}, status=status.HTTP_404_NOT_FOUND)
        receipt = (
            ReceiptDocument.objects.select_related("customer", "finance_account", "payment")
            .filter(pk=pk, customer=customer)
            .first()
        )
        if receipt is None:
            return Response({"detail": "Receipt not found."}, status=status.HTTP_404_NOT_FOUND)
        pdf_bytes = render_receipt_pdf(receipt=receipt)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="receipt-{receipt.receipt_no or receipt.id}.pdf"'
        )
        return response


class CustomerDepositPdfView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request, pk: int):
        customer = getattr(request.user, "customer_profile", None)
        if customer is None:
            return Response({"detail": "Customer profile missing."}, status=status.HTTP_404_NOT_FOUND)
        demand = (
            RentLeaseBillingDemand.objects.select_related("subscription", "subscription__customer", "subscription__product")
            .filter(
                pk=pk,
                demand_type=RentLeaseDemandType.SECURITY_DEPOSIT,
                subscription__customer=customer,
            )
            .first()
        )
        if demand is None:
            return Response({"detail": "Deposit not found."}, status=status.HTTP_404_NOT_FOUND)
        pdf_bytes = render_security_deposit_pdf(deposit_or_contract=demand)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="deposit-{demand.reference_key}.pdf"'
        return response


class CustomerReturnInspectionPdfView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request, pk: int):
        customer = getattr(request.user, "customer_profile", None)
        if customer is None:
            return Response({"detail": "Customer profile missing."}, status=status.HTTP_404_NOT_FOUND)
        inspection = (
            RentLeaseReturnInspection.objects.select_related("subscription", "subscription__customer")
            .filter(pk=pk, subscription__customer=customer)
            .first()
        )
        if inspection is None:
            return Response({"detail": "Return inspection not found."}, status=status.HTTP_404_NOT_FOUND)
        pdf_bytes = render_return_inspection_pdf(return_or_inspection_record=inspection)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="return-inspection-{inspection.id}.pdf"'
        )
        return response


class CustomerDocumentListView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        customer = getattr(request.user, "customer_profile", None)
        if customer is None:
            return Response({"detail": "Customer profile missing."}, status=status.HTTP_404_NOT_FOUND)
        return Response(customer_document_list(customer=customer))


class CustomerPaymentScheduleView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        customer = getattr(request.user, "customer_profile", None)
        if customer is None:
            return Response({"detail": "Customer profile missing."}, status=status.HTTP_404_NOT_FOUND)
        return Response(customer_payment_schedule(customer=customer))


class CustomerAccountStatementView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        customer = getattr(request.user, "customer_profile", None)
        if customer is None:
            return Response({"detail": "Customer profile missing."}, status=status.HTTP_404_NOT_FOUND)
        flt = FinanceFilter.from_query_params(request.query_params)
        return Response(customer_account_statement(customer=customer, flt=flt))


class CustomerDirectSaleListView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        customer = _safe_customer_profile(request)
        if customer is None:
            return Response(
                {"count": 0, "page": 1, "page_size": 20, "results": []},
                status=status.HTTP_200_OK,
            )

        queryset = _direct_sale_queryset_for_customer(customer)
        page_rows, page, page_size, total_count = _paginate_customer_queryset(request, queryset)
        rows = list(page_rows)
        for row in rows:
            row._customer_invoice = row.billing_invoices.order_by("-invoice_date", "-id").first()
            row._customer_lines = list(row.lines.all())
        serializer = CustomerDirectSaleListSerializer(rows, many=True, context={"request": request})
        return Response(
            {
                "count": total_count,
                "page": page,
                "page_size": page_size,
                "results": serializer.data,
            }
        )


class CustomerDirectSaleDetailView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request, pk: int):
        customer = _safe_customer_profile(request)
        if customer is None:
            return Response({"detail": "Direct sale not found."}, status=status.HTTP_404_NOT_FOUND)

        sale = _direct_sale_queryset_for_customer(customer).filter(pk=pk).first()
        if sale is None:
            return Response({"detail": "Direct sale not found."}, status=status.HTTP_404_NOT_FOUND)

        sale._customer_invoice = sale.billing_invoices.order_by("-invoice_date", "-id").first()
        sale._customer_lines = list(sale.lines.all())
        sale._customer_receipts = list(sale.receipts.order_by("-receipt_date", "-id"))
        serializer = CustomerDirectSaleDetailSerializer(sale, context={"request": request})
        return Response(serializer.data)


class CustomerDirectSaleSummaryView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        customer = _safe_customer_profile(request)
        if customer is None:
            serializer = CustomerDirectSaleSummarySerializer(
                {
                    "total_direct_sale_invoices": 0,
                    "total_outstanding_direct_sale_dues": Decimal("0.00"),
                    "total_paid_direct_sale_amount": Decimal("0.00"),
                    "overdue_direct_sale_count": 0,
                    "latest_direct_sale_invoice": None,
                }
            )
            return Response(serializer.data)

        rows = list(_direct_sale_queryset_for_customer(customer))
        total_invoices = len(rows)
        total_paid = Decimal("0.00")
        total_due = Decimal("0.00")
        overdue_count = 0
        latest_invoice = None

        for index, row in enumerate(rows):
            total_paid += Decimal(str(row.received_total or "0.00"))
            outstanding = _direct_sale_outstanding_amount(row)
            status_token = (row.status or "").upper()
            invoice = row.billing_invoices.order_by("-invoice_date", "-id").first()
            invoice_status = (getattr(invoice, "status", "") or "").strip().upper()
            is_payable_status = (
                status_token not in INACTIVE_DIRECT_SALE_STATUSES
                and invoice_status in {BillingDocumentStatus.APPROVED, BillingDocumentStatus.POSTED}
            )
            if is_payable_status:
                total_due += outstanding
            if is_payable_status and outstanding > Decimal("0.00"):
                overdue_count += 1
            if index == 0:
                latest_invoice = {
                    "id": row.id,
                    "document_number": row.sale_no,
                    "invoice_number": getattr(invoice, "document_no", None),
                    "sale_date": row.sale_date,
                    "status": row.status,
                    "grand_total": row.grand_total,
                    "paid_amount": row.received_total,
                    "outstanding_amount": outstanding,
                    "detail_url": request.build_absolute_uri(f"/customer/direct-sales/{row.id}"),
                    "invoice_pdf_url": request.build_absolute_uri(f"/api/v1/customer/invoices/{invoice.id}/pdf/")
                    if invoice is not None
                    else None,
                }

        serializer = CustomerDirectSaleSummarySerializer(
            {
                "total_direct_sale_invoices": total_invoices,
                "total_outstanding_direct_sale_dues": total_due.quantize(Decimal("0.01")),
                "total_paid_direct_sale_amount": total_paid.quantize(Decimal("0.01")),
                "overdue_direct_sale_count": overdue_count,
                "latest_direct_sale_invoice": latest_invoice,
            }
        )
        return Response(serializer.data)


class PartnerFinanceSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsPartner]

    def get(self, request):
        return Response(partner_finance_summary(partner=request.user))


class PartnerLinkedCustomerPaymentsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsPartner]

    def get(self, request):
        return Response(partner_linked_customer_payments(partner=request.user))


class PartnerReceiptListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsPartner]

    def get(self, request):
        return Response(partner_receipt_list(partner=request.user))
