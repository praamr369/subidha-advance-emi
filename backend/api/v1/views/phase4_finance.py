from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin, IsCustomer, IsPartner
from accounting.models import ChartOfAccount, FinanceAccount, RentLeaseAccountingAccountMapping
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
from subscriptions.services.rent_lease_billing_service import (
    list_admin_deposit_register,
    record_damage_deduction,
    approve_deposit_refund,
    record_deposit_refund,
)
from subscriptions.services.rent_lease_finance_sync_service import get_active_account_mapping


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
