from __future__ import annotations

import os

from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.models import CreditNote, DebitNote, ExportPackJob, TaxInvoice
from accounting.services.bridge_run_service import run_bridge_postings
from accounting.services.export_pack_service import (
    create_itr_export_pack_job,
    generate_itr_export_pack,
)
from accounting.services.gst_document_posting_service import (
    approve_credit_note,
    approve_debit_note,
    approve_tax_invoice,
    post_credit_note,
    post_debit_note,
    post_tax_invoice,
)
from accounting.services.reporting_service import (
    build_balance_sheet,
    build_cashbook,
    build_general_ledger,
    build_profit_loss,
    build_trial_balance,
)
from api.v1.permissions import IsAdmin
from api.v1.serializers.accounting_phase2 import (
    BalanceSheetQuerySerializer,
    BridgeRunSerializer,
    CashbookQuerySerializer,
    CreditNoteSerializer,
    DebitNoteSerializer,
    EmptyPhase2ActionSerializer,
    ExportPackJobSerializer,
    GeneralLedgerQuerySerializer,
    ItrExportPackCreateSerializer,
    TaxInvoiceSerializer,
    AccountingDateRangeQuerySerializer,
)


class AdminAccountingPhase2ViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    http_method_names = ["get", "post", "patch", "head", "options"]


class TaxInvoiceViewSet(AdminAccountingPhase2ViewSet):
    queryset = TaxInvoice.objects.select_related(
        "doc_series",
        "approved_by",
        "posted_journal_entry",
    ).prefetch_related("lines").all()
    serializer_class = TaxInvoiceSerializer
    search_fields = ["invoice_no", "recipient_name", "recipient_gstin", "supplier_gstin"]
    ordering_fields = ["invoice_date", "created_at", "invoice_no"]
    ordering = ["-invoice_date", "-created_at", "-id"]

    def get_serializer_class(self):
        if self.action in {"approve", "post_document"}:
            return EmptyPhase2ActionSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            invoice, updated = approve_tax_invoice(
                tax_invoice_id=int(pk),
                approved_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = TaxInvoiceSerializer(invoice, context=self.get_serializer_context())
        return Response({"updated": updated, "tax_invoice": payload.data})

    @action(detail=True, methods=["post"], url_path="post")
    def post_document(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            invoice, updated = post_tax_invoice(
                tax_invoice_id=int(pk),
                posted_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = TaxInvoiceSerializer(invoice, context=self.get_serializer_context())
        return Response({"updated": updated, "tax_invoice": payload.data})


class CreditNoteViewSet(AdminAccountingPhase2ViewSet):
    queryset = CreditNote.objects.select_related(
        "doc_series",
        "original_invoice",
        "approved_by",
        "posted_journal_entry",
    ).all()
    serializer_class = CreditNoteSerializer
    search_fields = ["note_no", "reason", "original_invoice__invoice_no"]
    ordering_fields = ["note_date", "created_at", "note_no"]
    ordering = ["-note_date", "-created_at", "-id"]

    def get_serializer_class(self):
        if self.action in {"approve", "post_document"}:
            return EmptyPhase2ActionSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            note, updated = approve_credit_note(
                credit_note_id=int(pk),
                approved_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = CreditNoteSerializer(note, context=self.get_serializer_context())
        return Response({"updated": updated, "credit_note": payload.data})

    @action(detail=True, methods=["post"], url_path="post")
    def post_document(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            note, updated = post_credit_note(
                credit_note_id=int(pk),
                posted_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = CreditNoteSerializer(note, context=self.get_serializer_context())
        return Response({"updated": updated, "credit_note": payload.data})


class DebitNoteViewSet(AdminAccountingPhase2ViewSet):
    queryset = DebitNote.objects.select_related(
        "doc_series",
        "original_invoice",
        "approved_by",
        "posted_journal_entry",
    ).all()
    serializer_class = DebitNoteSerializer
    search_fields = ["note_no", "reason", "original_invoice__invoice_no"]
    ordering_fields = ["note_date", "created_at", "note_no"]
    ordering = ["-note_date", "-created_at", "-id"]

    def get_serializer_class(self):
        if self.action in {"approve", "post_document"}:
            return EmptyPhase2ActionSerializer
        return super().get_serializer_class()

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            note, updated = approve_debit_note(
                debit_note_id=int(pk),
                approved_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = DebitNoteSerializer(note, context=self.get_serializer_context())
        return Response({"updated": updated, "debit_note": payload.data})

    @action(detail=True, methods=["post"], url_path="post")
    def post_document(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            note, updated = post_debit_note(
                debit_note_id=int(pk),
                posted_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        payload = DebitNoteSerializer(note, context=self.get_serializer_context())
        return Response({"updated": updated, "debit_note": payload.data})


class AdminAccountingReportView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class TrialBalanceReportView(AdminAccountingReportView):
    def get(self, request):
        serializer = AccountingDateRangeQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return Response(build_trial_balance(**serializer.validated_data))


class ProfitLossReportView(AdminAccountingReportView):
    def get(self, request):
        serializer = AccountingDateRangeQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return Response(build_profit_loss(**serializer.validated_data))


class BalanceSheetReportView(AdminAccountingReportView):
    def get(self, request):
        serializer = BalanceSheetQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        as_of = serializer.validated_data.get("as_of") or timezone.localdate()
        return Response(build_balance_sheet(as_of=as_of))


class GeneralLedgerReportView(AdminAccountingReportView):
    def get(self, request):
        serializer = GeneralLedgerQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return Response(build_general_ledger(**serializer.validated_data))


class CashbookReportView(AdminAccountingReportView):
    def get(self, request):
        serializer = CashbookQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return Response(build_cashbook(**serializer.validated_data))


class ItrExportPackListCreateView(AdminAccountingReportView):
    def get(self, request):
        queryset = ExportPackJob.objects.select_related("created_by").all()
        serializer = ExportPackJobSerializer(queryset, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = ItrExportPackCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        job = create_itr_export_pack_job(
            financial_year=serializer.validated_data.get("financial_year", ""),
            start_date=serializer.validated_data.get("start_date"),
            end_date=serializer.validated_data.get("end_date"),
            created_by=request.user,
        )
        job = generate_itr_export_pack(job_id=job.id)
        payload = ExportPackJobSerializer(job)
        return Response(payload.data, status=status.HTTP_201_CREATED)


class ItrExportPackDetailView(AdminAccountingReportView):
    def get(self, request, pk: int):
        job = ExportPackJob.objects.select_related("created_by").get(pk=pk)
        serializer = ExportPackJobSerializer(job)
        return Response(serializer.data)


class ItrExportPackDownloadView(AdminAccountingReportView):
    def get(self, request, pk: int):
        job = ExportPackJob.objects.get(pk=pk)
        if not job.file_path or not os.path.exists(job.file_path):
            raise Http404("Export pack file is not available.")
        return FileResponse(
            open(job.file_path, "rb"),
            as_attachment=True,
            filename=os.path.basename(job.file_path),
        )


class BridgeRunView(AdminAccountingReportView):
    def post(self, request):
        serializer = BridgeRunSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = run_bridge_postings(
                start_date=serializer.validated_data["start_date"],
                end_date=serializer.validated_data["end_date"],
                purposes=serializer.validated_data.get("purposes"),
                dry_run=serializer.validated_data.get("dry_run", False),
                performed_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(result, status=status.HTTP_200_OK)
