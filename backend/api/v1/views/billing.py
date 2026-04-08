from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from billing.models import BillingCreditNote, BillingDebitNote, BillingInvoice, ReceiptDocument
from accounting.services.books_service import build_cash_book, build_daily_billing_book
from billing.services.billing_service import (
    approve_billing_credit_note,
    approve_billing_debit_note,
    approve_billing_invoice,
    generate_emi_payment_receipt,
    post_billing_credit_note,
    post_billing_debit_note,
    post_billing_invoice,
    void_receipt_document,
)
from api.v1.permissions import IsAdmin
from api.v1.serializers.accounting_phase3 import AccountingBookQuerySerializer
from api.v1.serializers.billing import (
    BillingCreditNoteSerializer,
    BillingDebitNoteSerializer,
    BillingInvoiceSerializer,
    EmiPaymentReceiptGenerateSerializer,
    EmptyBillingActionSerializer,
    ReceiptDocumentSerializer,
    ReceiptVoidSerializer,
)


class AdminBillingModelViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    http_method_names = ["get", "post", "patch", "head", "options"]


class BillingInvoiceViewSet(AdminBillingModelViewSet):
    queryset = BillingInvoice.objects.select_related(
        "customer",
        "subscription",
        "doc_series",
        "finance_account",
        "posted_journal_entry",
    ).prefetch_related("lines").all()
    serializer_class = BillingInvoiceSerializer
    search_fields = ["document_no", "customer_name_snapshot", "customer_phone_snapshot"]
    ordering_fields = ["invoice_date", "created_at", "document_no"]
    ordering = ["-invoice_date", "-created_at", "-id"]

    def get_serializer_class(self):
        if self.action in {"approve", "post_invoice"}:
            return EmptyBillingActionSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            invoice, updated = approve_billing_invoice(invoice_id=int(pk), approved_by=request.user)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = BillingInvoiceSerializer(invoice, context=self.get_serializer_context())
        return Response({"updated": updated, "invoice": payload.data})

    @action(detail=True, methods=["post"], url_path="post")
    def post_invoice(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            invoice, updated = post_billing_invoice(invoice_id=int(pk), posted_by=request.user)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = BillingInvoiceSerializer(invoice, context=self.get_serializer_context())
        return Response({"updated": updated, "invoice": payload.data})


class BillingCreditNoteViewSet(AdminBillingModelViewSet):
    queryset = BillingCreditNote.objects.select_related("doc_series", "original_invoice", "posted_journal_entry").prefetch_related("lines").all()
    serializer_class = BillingCreditNoteSerializer
    search_fields = ["note_no", "reason", "original_invoice__document_no"]
    ordering_fields = ["note_date", "created_at", "note_no"]
    ordering = ["-note_date", "-created_at", "-id"]

    def get_serializer_class(self):
        if self.action in {"approve", "post_note"}:
            return EmptyBillingActionSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            note, updated = approve_billing_credit_note(
                credit_note_id=int(pk),
                approved_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = BillingCreditNoteSerializer(note, context=self.get_serializer_context())
        return Response({"updated": updated, "credit_note": payload.data})

    @action(detail=True, methods=["post"], url_path="post")
    def post_note(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            note, updated = post_billing_credit_note(
                credit_note_id=int(pk),
                posted_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = BillingCreditNoteSerializer(note, context=self.get_serializer_context())
        return Response({"updated": updated, "credit_note": payload.data})


class BillingDebitNoteViewSet(AdminBillingModelViewSet):
    queryset = BillingDebitNote.objects.select_related("doc_series", "original_invoice", "posted_journal_entry").prefetch_related("lines").all()
    serializer_class = BillingDebitNoteSerializer
    search_fields = ["note_no", "reason", "original_invoice__document_no"]
    ordering_fields = ["note_date", "created_at", "note_no"]
    ordering = ["-note_date", "-created_at", "-id"]

    def get_serializer_class(self):
        if self.action in {"approve", "post_note"}:
            return EmptyBillingActionSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            note, updated = approve_billing_debit_note(
                debit_note_id=int(pk),
                approved_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = BillingDebitNoteSerializer(note, context=self.get_serializer_context())
        return Response({"updated": updated, "debit_note": payload.data})

    @action(detail=True, methods=["post"], url_path="post")
    def post_note(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            note, updated = post_billing_debit_note(
                debit_note_id=int(pk),
                posted_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = BillingDebitNoteSerializer(note, context=self.get_serializer_context())
        return Response({"updated": updated, "debit_note": payload.data})


class ReceiptDocumentViewSet(AdminBillingModelViewSet):
    queryset = ReceiptDocument.objects.select_related(
        "finance_account",
        "billing_invoice",
        "customer",
        "subscription",
        "payment",
        "posted_journal_entry",
    ).all()
    serializer_class = ReceiptDocumentSerializer
    search_fields = ["receipt_no", "customer_name_snapshot", "customer_phone_snapshot"]
    ordering_fields = ["receipt_date", "created_at", "receipt_no"]
    ordering = ["-receipt_date", "-created_at", "-id"]

    def get_serializer_class(self):
        if self.action == "void_document":
            return ReceiptVoidSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="void")
    def void_document(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            receipt, updated = void_receipt_document(
                receipt_id=int(pk),
                performed_by=request.user,
                reason=serializer.validated_data["reason"],
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = ReceiptDocumentSerializer(receipt, context=self.get_serializer_context())
        return Response({"updated": updated, "receipt": payload.data})


class EmiPaymentReceiptGenerateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, payment_id: int):
        serializer = EmiPaymentReceiptGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            receipt, created = generate_emi_payment_receipt(
                payment_id=payment_id,
                finance_account_id=serializer.validated_data["finance_account_id"],
                performed_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = ReceiptDocumentSerializer(receipt)
        return Response({"created": created, "receipt": payload.data}, status=status.HTTP_200_OK)


class BillingDailyBookView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        serializer = AccountingBookQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return Response(build_daily_billing_book(**serializer.validated_data))


class BillingCashBookView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        serializer = AccountingBookQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        payload = build_cash_book(
            finance_account_id=request.query_params.get("finance_account_id"),
            **serializer.validated_data,
        )
        return Response(payload)
