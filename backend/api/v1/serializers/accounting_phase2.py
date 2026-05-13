from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from accounting.models import (
    MONEY_ZERO,
    CreditNote,
    DebitNote,
    DocumentSequence,
    ExportPackJob,
    TaxDocumentStatus,
    TaxInvoice,
    TaxInvoiceLine,
)
from accounting.services.gst_document_posting_service import (
    ensure_document_sequence,
    financial_year_for,
)
from accounting.services.tax_guard_service import TaxComplianceError, assert_gst_invoice_allowed


def _money(value) -> Decimal:
    return Decimal(str(value or MONEY_ZERO)).quantize(Decimal("0.01"))


class AccountingDateRangeQuerySerializer(serializers.Serializer):
    start_date = serializers.DateField(required=False)
    end_date = serializers.DateField(required=False)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        start_date = attrs.get("start_date")
        end_date = attrs.get("end_date")
        if start_date and end_date and start_date > end_date:
            raise serializers.ValidationError(
                {"end_date": "end_date must be on or after start_date."}
            )
        return attrs


class BalanceSheetQuerySerializer(serializers.Serializer):
    as_of = serializers.DateField(required=False)


class GeneralLedgerQuerySerializer(AccountingDateRangeQuerySerializer):
    account_id = serializers.IntegerField(min_value=1)


class CashbookQuerySerializer(AccountingDateRangeQuerySerializer):
    finance_account_id = serializers.IntegerField(min_value=1)


class TaxInvoiceLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxInvoiceLine
        fields = [
            "id",
            "description",
            "hsn_sac",
            "quantity",
            "taxable_value",
            "gst_rate",
            "cgst_amount",
            "sgst_amount",
            "igst_amount",
            "line_total",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


def _replace_invoice_lines(invoice: TaxInvoice, lines: list[dict]):
    invoice.lines.all().delete()
    TaxInvoiceLine.objects.bulk_create(
        [TaxInvoiceLine(tax_invoice=invoice, **line) for line in lines]
    )


def _validate_invoice_line_totals(*, lines: list[dict], attrs: dict):
    if not lines:
        return

    taxable_total = MONEY_ZERO
    cgst_total = MONEY_ZERO
    sgst_total = MONEY_ZERO
    igst_total = MONEY_ZERO
    grand_total = MONEY_ZERO

    for line in lines:
        taxable_total += _money(line.get("taxable_value"))
        cgst_total += _money(line.get("cgst_amount"))
        sgst_total += _money(line.get("sgst_amount"))
        igst_total += _money(line.get("igst_amount"))
        grand_total += _money(line.get("line_total"))

    expected = {
        "subtotal_taxable": taxable_total,
        "cgst_amount": cgst_total,
        "sgst_amount": sgst_total,
        "igst_amount": igst_total,
        "total_amount": grand_total,
    }
    for field, value in expected.items():
        if field in attrs and _money(attrs[field]) != value:
            raise serializers.ValidationError(
                {field: f"{field} must match the invoice line totals."}
            )


def _resolve_doc_sequence(
    *,
    doc_series,
    series_code: str,
    prefix: str,
    document_date: date,
) -> DocumentSequence:
    if doc_series is not None:
        return doc_series
    return ensure_document_sequence(
        series_code=series_code,
        financial_year=financial_year_for(document_date),
        prefix=prefix,
    )


class TaxInvoiceSerializer(serializers.ModelSerializer):
    doc_series = serializers.PrimaryKeyRelatedField(
        queryset=DocumentSequence.objects.all(),
        required=False,
        allow_null=True,
    )
    doc_series_code = serializers.CharField(source="doc_series.series_code", read_only=True)
    doc_series_financial_year = serializers.CharField(
        source="doc_series.financial_year",
        read_only=True,
    )
    posted_journal_entry_no = serializers.CharField(
        source="posted_journal_entry.entry_no",
        read_only=True,
    )
    reversal_journal_entry_no = serializers.CharField(
        source="reversal_journal_entry.entry_no",
        read_only=True,
    )
    approved_by_username = serializers.CharField(source="approved_by.username", read_only=True)
    cancelled_by_username = serializers.CharField(source="cancelled_by.username", read_only=True)
    lines = TaxInvoiceLineSerializer(many=True, required=False)

    class Meta:
        model = TaxInvoice
        fields = [
            "id",
            "invoice_no",
            "invoice_date",
            "doc_series",
            "doc_series_code",
            "doc_series_financial_year",
            "supplier_name",
            "supplier_gstin",
            "supplier_address",
            "supplier_state_code",
            "recipient_name",
            "recipient_address",
            "recipient_gstin",
            "place_of_supply_state_code",
            "supply_kind",
            "subtotal_taxable",
            "cgst_amount",
            "sgst_amount",
            "igst_amount",
            "total_amount",
            "status",
            "notes",
            "cancelled_by",
            "cancelled_by_username",
            "cancelled_at",
            "cancel_reason",
            "approved_by",
            "approved_by_username",
            "approved_at",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "reversal_journal_entry",
            "reversal_journal_entry_no",
            "lines",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "invoice_no",
            "status",
            "cancelled_by",
            "cancelled_by_username",
            "cancelled_at",
            "cancel_reason",
            "approved_by",
            "approved_by_username",
            "approved_at",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "reversal_journal_entry",
            "reversal_journal_entry_no",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        try:
            assert_gst_invoice_allowed(operation="GST tax invoice")
        except TaxComplianceError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc
        instance = getattr(self, "instance", None)
        if instance and instance.status != TaxDocumentStatus.DRAFT:
            raise serializers.ValidationError("Only draft tax invoices can be edited.")
        _validate_invoice_line_totals(lines=attrs.get("lines") or [], attrs=attrs)
        return attrs

    def create(self, validated_data):
        lines = validated_data.pop("lines", [])
        doc_series = _resolve_doc_sequence(
            doc_series=validated_data.pop("doc_series", None),
            series_code="GST_INV",
            prefix="GSTINV",
            document_date=validated_data["invoice_date"],
        )
        invoice = TaxInvoice.objects.create(doc_series=doc_series, **validated_data)
        if lines:
            _replace_invoice_lines(invoice, lines)
        return invoice

    def update(self, instance, validated_data):
        lines = validated_data.pop("lines", None)
        doc_series = validated_data.pop("doc_series", None)
        if doc_series is not None:
            instance.doc_series = doc_series
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        if lines is not None:
            _replace_invoice_lines(instance, lines)
        return instance


class BaseGstNoteSerializer(serializers.ModelSerializer):
    doc_series = serializers.PrimaryKeyRelatedField(
        queryset=DocumentSequence.objects.all(),
        required=False,
        allow_null=True,
    )
    doc_series_code = serializers.CharField(source="doc_series.series_code", read_only=True)
    doc_series_financial_year = serializers.CharField(
        source="doc_series.financial_year",
        read_only=True,
    )
    original_invoice_no = serializers.CharField(
        source="original_invoice.invoice_no",
        read_only=True,
    )
    posted_journal_entry_no = serializers.CharField(
        source="posted_journal_entry.entry_no",
        read_only=True,
    )
    reversal_journal_entry_no = serializers.CharField(
        source="reversal_journal_entry.entry_no",
        read_only=True,
    )
    approved_by_username = serializers.CharField(source="approved_by.username", read_only=True)
    cancelled_by_username = serializers.CharField(source="cancelled_by.username", read_only=True)

    note_series_code = ""
    note_prefix = ""

    class Meta:
        model = CreditNote
        fields: list[str] = []
        read_only_fields: list[str] = []

    def validate(self, attrs):
        attrs = super().validate(attrs)
        try:
            assert_gst_invoice_allowed(operation="GST note")
        except TaxComplianceError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc
        instance = getattr(self, "instance", None)
        if instance and instance.status != TaxDocumentStatus.DRAFT:
            raise serializers.ValidationError("Only draft GST notes can be edited.")
        return attrs

    def create(self, validated_data):
        note_date = validated_data["note_date"]
        doc_series = _resolve_doc_sequence(
            doc_series=validated_data.pop("doc_series", None),
            series_code=self.note_series_code,
            prefix=self.note_prefix,
            document_date=note_date,
        )
        return self.Meta.model.objects.create(doc_series=doc_series, **validated_data)

    def update(self, instance, validated_data):
        doc_series = validated_data.pop("doc_series", None)
        if doc_series is not None:
            instance.doc_series = doc_series
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        return instance


class CreditNoteSerializer(BaseGstNoteSerializer):
    note_series_code = "GST_CN"
    note_prefix = "GSTCN"

    class Meta:
        model = CreditNote
        fields = [
            "id",
            "note_no",
            "note_date",
            "doc_series",
            "doc_series_code",
            "doc_series_financial_year",
            "original_invoice",
            "original_invoice_no",
            "reason",
            "taxable_adjustment",
            "tax_adjustment",
            "total_adjustment",
            "status",
            "cancelled_by",
            "cancelled_by_username",
            "cancelled_at",
            "cancel_reason",
            "approved_by",
            "approved_by_username",
            "approved_at",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "reversal_journal_entry",
            "reversal_journal_entry_no",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "note_no",
            "status",
            "cancelled_by",
            "cancelled_by_username",
            "cancelled_at",
            "cancel_reason",
            "approved_by",
            "approved_by_username",
            "approved_at",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "reversal_journal_entry",
            "reversal_journal_entry_no",
            "created_at",
            "updated_at",
        ]


class DebitNoteSerializer(BaseGstNoteSerializer):
    note_series_code = "GST_DN"
    note_prefix = "GSTDN"

    class Meta:
        model = DebitNote
        fields = [
            "id",
            "note_no",
            "note_date",
            "doc_series",
            "doc_series_code",
            "doc_series_financial_year",
            "original_invoice",
            "original_invoice_no",
            "reason",
            "taxable_adjustment",
            "tax_adjustment",
            "total_adjustment",
            "status",
            "cancelled_by",
            "cancelled_by_username",
            "cancelled_at",
            "cancel_reason",
            "approved_by",
            "approved_by_username",
            "approved_at",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "reversal_journal_entry",
            "reversal_journal_entry_no",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "note_no",
            "status",
            "cancelled_by",
            "cancelled_by_username",
            "cancelled_at",
            "cancel_reason",
            "approved_by",
            "approved_by_username",
            "approved_at",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "reversal_journal_entry",
            "reversal_journal_entry_no",
            "created_at",
            "updated_at",
        ]


class ExportPackJobSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = ExportPackJob
        fields = [
            "id",
            "pack_type",
            "financial_year",
            "start_date",
            "end_date",
            "status",
            "file_path",
            "created_by",
            "created_by_username",
            "error_message",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ItrExportPackCreateSerializer(AccountingDateRangeQuerySerializer):
    financial_year = serializers.CharField(required=False, allow_blank=True)


class GstExportPackCreateSerializer(AccountingDateRangeQuerySerializer):
    financial_year = serializers.CharField(required=False, allow_blank=True)


class BridgeRunSerializer(AccountingDateRangeQuerySerializer):
    dry_run = serializers.BooleanField(required=False, default=False)
    purposes = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        allow_empty=True,
    )

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if not attrs.get("start_date") or not attrs.get("end_date"):
            raise serializers.ValidationError(
                "start_date and end_date are required for controlled bridge runs."
            )
        return attrs


class EmptyPhase2ActionSerializer(serializers.Serializer):
    pass


class CancelPhase2ActionSerializer(serializers.Serializer):
    reason = serializers.CharField()


class BridgeRunResponseSerializer(serializers.Serializer):
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    purposes = serializers.ListField(child=serializers.CharField())
    dry_run = serializers.BooleanField()
    results = serializers.ListField(child=serializers.DictField())
