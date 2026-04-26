from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin, IsCustomer, IsPartner
from subscriptions.models import Subscription, SubscriptionDocument
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


class AdminInvoiceRegisterView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        flt = FinanceFilter.from_query_params(request.query_params)
        return Response(list_admin_invoices(flt=flt))


class AdminReceiptRegisterView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        flt = FinanceFilter.from_query_params(request.query_params)
        return Response(list_admin_receipts(flt=flt))


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


class CustomerReceiptListView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        customer = getattr(request.user, "customer_profile", None)
        if customer is None:
            return Response({"detail": "Customer profile missing."}, status=status.HTTP_404_NOT_FOUND)
        return Response(customer_receipt_list(customer=customer))


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
