from __future__ import annotations

from decimal import Decimal

from rest_framework import serializers

from accounting.models import DocumentSequence
from billing.models import (
    BillingCreditNote,
    BillingCreditNoteLine,
    BillingDebitNote,
    BillingDebitNoteLine,
    BillingDocumentStatus,
    BillingInvoice,
    BillingInvoiceLine,
    BillingInstallmentMirror,
    BillingProfile,
    BillingSyncEvent,
    DirectSale,
    DirectSaleLine,
    ReceiptDocument,
)
from billing.services.billing_sync_service import sync_subscription_billing_profile
from billing.services.billing_service import (
    _ensure_credit_sequence,
    _ensure_debit_sequence,
    _ensure_invoice_sequence,
    create_manual_receipt,
    create_direct_sale,
    update_direct_sale,
)


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


class EmptyBillingActionSerializer(serializers.Serializer):
    pass


class BillingProfileSyncSerializer(serializers.Serializer):
    pass


class ReceiptVoidSerializer(serializers.Serializer):
    reason = serializers.CharField(required=True, allow_blank=False)


class DirectSaleConfirmSerializer(serializers.Serializer):
    pass


class DirectSaleDeliveredSerializer(serializers.Serializer):
    delivery_reference = serializers.CharField(required=False, allow_blank=True)


class DirectSaleLineSerializer(serializers.ModelSerializer):
    product_code = serializers.CharField(source="product.product_code", read_only=True)
    inventory_item_sku = serializers.CharField(source="inventory_item.sku", read_only=True)

    class Meta:
        model = DirectSaleLine
        fields = [
            "id",
            "product",
            "product_code",
            "inventory_item",
            "inventory_item_sku",
            "description",
            "quantity",
            "unit_price",
            "discount_amount",
            "taxable_value",
            "gst_rate",
            "cgst_amount",
            "sgst_amount",
            "igst_amount",
            "line_total",
            "product_code_snapshot",
            "sku_snapshot",
            "unit_of_measure_snapshot",
            "hsn_sac_code",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "product_code_snapshot",
            "sku_snapshot",
            "unit_of_measure_snapshot",
            "created_at",
            "updated_at",
        ]


class BillingInvoiceLineSerializer(serializers.ModelSerializer):
    product_code = serializers.CharField(source="product.product_code", read_only=True)
    inventory_item_sku = serializers.CharField(source="inventory_item.sku", read_only=True)

    class Meta:
        model = BillingInvoiceLine
        fields = [
            "id",
            "product",
            "product_code",
            "inventory_item",
            "inventory_item_sku",
            "description",
            "quantity",
            "unit_price",
            "discount_amount",
            "taxable_value",
            "gst_rate",
            "cgst_amount",
            "sgst_amount",
            "igst_amount",
            "line_total",
            "hsn_sac_code",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


def _replace_invoice_lines(invoice: BillingInvoice, lines: list[dict]):
    invoice.lines.all().delete()
    BillingInvoiceLine.objects.bulk_create(
        [BillingInvoiceLine(invoice=invoice, **line) for line in lines]
    )


def _validate_invoice_lines(lines: list[dict], attrs: dict):
    if not lines:
        return
    subtotal = Decimal("0.00")
    taxable_total = Decimal("0.00")
    tax_total = Decimal("0.00")
    grand_total = Decimal("0.00")
    for line in lines:
        subtotal += _money(line.get("unit_price")) * Decimal(str(line.get("quantity") or "0"))
        taxable_total += _money(line.get("taxable_value"))
        tax_total += _money(line.get("cgst_amount")) + _money(line.get("sgst_amount")) + _money(line.get("igst_amount"))
        grand_total += _money(line.get("line_total"))
    expected = {
        "subtotal": subtotal.quantize(Decimal("0.01")),
        "taxable_total": taxable_total,
        "tax_total": tax_total,
        "grand_total": grand_total,
    }
    for key, value in expected.items():
        if key in attrs and _money(attrs[key]) != value:
            raise serializers.ValidationError({key: f"{key} must match the invoice line totals."})


class DirectSaleSerializer(serializers.ModelSerializer):
    lines = DirectSaleLineSerializer(many=True)
    doc_series_code = serializers.CharField(source="doc_series.series_code", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    finance_account_name = serializers.CharField(source="finance_account.name", read_only=True)
    confirmed_by_username = serializers.CharField(source="confirmed_by.username", read_only=True)
    billing_invoice_id = serializers.SerializerMethodField()
    billing_invoice_no = serializers.SerializerMethodField()
    billing_invoice_status = serializers.SerializerMethodField()

    class Meta:
        model = DirectSale
        fields = [
            "id",
            "sale_no",
            "sale_date",
            "financial_year",
            "doc_series",
            "doc_series_code",
            "customer",
            "customer_name",
            "status",
            "tax_mode",
            "finance_account",
            "finance_account_name",
            "delivery_required",
            "delivery_reference",
            "delivered_at",
            "confirmed_by",
            "confirmed_by_username",
            "confirmed_at",
            "invoiced_at",
            "subtotal",
            "discount_total",
            "taxable_total",
            "tax_total",
            "grand_total",
            "received_total",
            "balance_total",
            "customer_name_snapshot",
            "customer_phone_snapshot",
            "customer_gstin",
            "notes",
            "billing_invoice_id",
            "billing_invoice_no",
            "billing_invoice_status",
            "lines",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "sale_no",
            "financial_year",
            "doc_series",
            "doc_series_code",
            "status",
            "delivered_at",
            "confirmed_by",
            "confirmed_by_username",
            "confirmed_at",
            "invoiced_at",
            "billing_invoice_id",
            "billing_invoice_no",
            "billing_invoice_status",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        if instance and instance.status not in {"DRAFT", "CONFIRMED", "DELIVERED"}:
            raise serializers.ValidationError(
                "Only draft, confirmed, or delivered direct sales can be edited."
            )
        _validate_invoice_lines(attrs.get("lines") or [], attrs)
        return attrs

    def create(self, validated_data):
        return create_direct_sale(
            payload=validated_data,
            created_by=self.context["request"].user,
        )

    def update(self, instance, validated_data):
        return update_direct_sale(
            direct_sale_id=instance.id,
            payload=validated_data,
            updated_by=self.context["request"].user,
        )

    def _latest_invoice(self, obj):
        if hasattr(obj, "_latest_invoice_cache"):
            return obj._latest_invoice_cache
        latest = obj.billing_invoices.order_by("-id").first()
        obj._latest_invoice_cache = latest
        return latest

    def get_billing_invoice_id(self, obj):
        latest = self._latest_invoice(obj)
        return getattr(latest, "id", None)

    def get_billing_invoice_no(self, obj):
        latest = self._latest_invoice(obj)
        return getattr(latest, "document_no", None)

    def get_billing_invoice_status(self, obj):
        latest = self._latest_invoice(obj)
        return getattr(latest, "status", None)


class BillingInvoiceSerializer(serializers.ModelSerializer):
    lines = BillingInvoiceLineSerializer(many=True)
    doc_series = serializers.PrimaryKeyRelatedField(
        queryset=DocumentSequence.objects.all(),
        required=False,
        allow_null=True,
    )
    doc_series_code = serializers.CharField(source="doc_series.series_code", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    direct_sale_no = serializers.CharField(source="direct_sale.sale_no", read_only=True)
    posted_journal_entry_no = serializers.CharField(source="posted_journal_entry.entry_no", read_only=True)
    finance_account_name = serializers.CharField(source="finance_account.name", read_only=True)

    class Meta:
        model = BillingInvoice
        fields = [
            "id",
            "document_no",
            "invoice_date",
            "financial_year",
            "document_type",
            "doc_series",
            "doc_series_code",
            "customer",
            "customer_name",
            "subscription",
            "direct_sale",
            "direct_sale_no",
            "billing_channel",
            "source_type",
            "source_reference",
            "tax_mode",
            "status",
            "finance_account",
            "finance_account_name",
            "subtotal",
            "discount_total",
            "taxable_total",
            "tax_total",
            "grand_total",
            "received_total",
            "balance_total",
            "place_of_supply_state_code",
            "customer_name_snapshot",
            "customer_phone_snapshot",
            "customer_gstin",
            "notes",
            "terms",
            "printed_at",
            "printed_count",
            "approved_by",
            "approved_at",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "lines",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "document_no",
            "direct_sale",
            "direct_sale_no",
            "source_type",
            "source_reference",
            "status",
            "printed_at",
            "printed_count",
            "approved_by",
            "approved_at",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        if instance and instance.status != BillingDocumentStatus.DRAFT:
            raise serializers.ValidationError("Only draft invoices can be edited.")
        _validate_invoice_lines(attrs.get("lines") or [], attrs)
        return attrs

    def create(self, validated_data):
        lines = validated_data.pop("lines", [])
        doc_series = validated_data.pop("doc_series", None) or _ensure_invoice_sequence(validated_data["invoice_date"])
        invoice = BillingInvoice.objects.create(doc_series=doc_series, **validated_data)
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


class BillingCreditNoteLineSerializer(serializers.ModelSerializer):
    inventory_item_sku = serializers.CharField(source="inventory_item.sku", read_only=True)

    class Meta:
        model = BillingCreditNoteLine
        fields = [
            "id",
            "inventory_item",
            "inventory_item_sku",
            "description",
            "quantity",
            "taxable_value",
            "tax_amount",
            "line_total",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class BillingDebitNoteLineSerializer(serializers.ModelSerializer):
    inventory_item_sku = serializers.CharField(source="inventory_item.sku", read_only=True)

    class Meta:
        model = BillingDebitNoteLine
        fields = [
            "id",
            "inventory_item",
            "inventory_item_sku",
            "description",
            "quantity",
            "taxable_value",
            "tax_amount",
            "line_total",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


def _replace_credit_lines(note: BillingCreditNote, lines: list[dict]):
    note.lines.all().delete()
    BillingCreditNoteLine.objects.bulk_create(
        [BillingCreditNoteLine(credit_note=note, **line) for line in lines]
    )


def _replace_debit_lines(note: BillingDebitNote, lines: list[dict]):
    note.lines.all().delete()
    BillingDebitNoteLine.objects.bulk_create(
        [BillingDebitNoteLine(debit_note=note, **line) for line in lines]
    )


class BillingCreditNoteSerializer(serializers.ModelSerializer):
    lines = BillingCreditNoteLineSerializer(many=True, required=False)
    doc_series = serializers.PrimaryKeyRelatedField(
        queryset=DocumentSequence.objects.all(),
        required=False,
        allow_null=True,
    )
    original_invoice_no = serializers.CharField(source="original_invoice.document_no", read_only=True)
    posted_journal_entry_no = serializers.CharField(source="posted_journal_entry.entry_no", read_only=True)

    class Meta:
        model = BillingCreditNote
        fields = [
            "id",
            "note_no",
            "note_date",
            "doc_series",
            "original_invoice",
            "original_invoice_no",
            "reason",
            "stock_effect",
            "taxable_adjustment",
            "tax_adjustment",
            "total_adjustment",
            "status",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "lines",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "note_no",
            "status",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        if instance and instance.status != BillingDocumentStatus.DRAFT:
            raise serializers.ValidationError("Only draft credit notes can be edited.")
        return attrs

    def create(self, validated_data):
        lines = validated_data.pop("lines", [])
        doc_series = validated_data.pop("doc_series", None) or _ensure_credit_sequence(validated_data["note_date"])
        note = BillingCreditNote.objects.create(doc_series=doc_series, **validated_data)
        if lines:
            _replace_credit_lines(note, lines)
        return note

    def update(self, instance, validated_data):
        lines = validated_data.pop("lines", None)
        doc_series = validated_data.pop("doc_series", None)
        if doc_series is not None:
            instance.doc_series = doc_series
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        if lines is not None:
            _replace_credit_lines(instance, lines)
        return instance


class BillingDebitNoteSerializer(serializers.ModelSerializer):
    lines = BillingDebitNoteLineSerializer(many=True, required=False)
    doc_series = serializers.PrimaryKeyRelatedField(
        queryset=DocumentSequence.objects.all(),
        required=False,
        allow_null=True,
    )
    original_invoice_no = serializers.CharField(source="original_invoice.document_no", read_only=True)
    posted_journal_entry_no = serializers.CharField(source="posted_journal_entry.entry_no", read_only=True)

    class Meta:
        model = BillingDebitNote
        fields = [
            "id",
            "note_no",
            "note_date",
            "doc_series",
            "original_invoice",
            "original_invoice_no",
            "reason",
            "stock_effect",
            "taxable_adjustment",
            "tax_adjustment",
            "total_adjustment",
            "status",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "lines",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "note_no",
            "status",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        if instance and instance.status != BillingDocumentStatus.DRAFT:
            raise serializers.ValidationError("Only draft debit notes can be edited.")
        return attrs

    def create(self, validated_data):
        lines = validated_data.pop("lines", [])
        doc_series = validated_data.pop("doc_series", None) or _ensure_debit_sequence(validated_data["note_date"])
        note = BillingDebitNote.objects.create(doc_series=doc_series, **validated_data)
        if lines:
            _replace_debit_lines(note, lines)
        return note

    def update(self, instance, validated_data):
        lines = validated_data.pop("lines", None)
        doc_series = validated_data.pop("doc_series", None)
        if doc_series is not None:
            instance.doc_series = doc_series
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        if lines is not None:
            _replace_debit_lines(instance, lines)
        return instance


class ReceiptDocumentSerializer(serializers.ModelSerializer):
    posted_journal_entry_no = serializers.CharField(source="posted_journal_entry.entry_no", read_only=True)
    finance_account_name = serializers.CharField(source="finance_account.name", read_only=True)
    direct_sale_no = serializers.CharField(source="direct_sale.sale_no", read_only=True)

    class Meta:
        model = ReceiptDocument
        fields = [
            "id",
            "receipt_no",
            "receipt_type",
            "status",
            "receipt_date",
            "finance_account",
            "finance_account_name",
            "billing_invoice",
            "direct_sale",
            "direct_sale_no",
            "customer",
            "subscription",
            "payment",
            "source_type",
            "source_reference",
            "amount",
            "customer_name_snapshot",
            "customer_phone_snapshot",
            "notes",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "printed_at",
            "printed_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "receipt_no",
            "direct_sale",
            "direct_sale_no",
            "source_type",
            "source_reference",
            "status",
            "posted_journal_entry",
            "posted_journal_entry_no",
            "printed_at",
            "printed_count",
            "created_at",
            "updated_at",
        ]

    def create(self, validated_data):
        return create_manual_receipt(
            receipt_date=validated_data["receipt_date"],
            finance_account_id=validated_data["finance_account"].id,
            amount=validated_data["amount"],
            receipt_type=validated_data["receipt_type"],
            billing_invoice_id=getattr(validated_data.get("billing_invoice"), "id", None),
            direct_sale_id=getattr(validated_data.get("direct_sale"), "id", None),
            customer_id=getattr(validated_data.get("customer"), "id", None),
            subscription_id=getattr(validated_data.get("subscription"), "id", None),
            payment_id=getattr(validated_data.get("payment"), "id", None),
            notes=validated_data.get("notes", ""),
            created_by=self.context["request"].user,
        )


class EmiPaymentReceiptGenerateSerializer(serializers.Serializer):
    finance_account_id = serializers.IntegerField(min_value=1)


class BillingInstallmentMirrorSerializer(serializers.ModelSerializer):
    subscription_id = serializers.IntegerField(source="billing_profile.subscription_id", read_only=True)
    customer_id = serializers.IntegerField(source="billing_profile.customer_id", read_only=True)
    product_id = serializers.IntegerField(source="billing_profile.product_id", read_only=True)

    class Meta:
        model = BillingInstallmentMirror
        fields = [
            "id",
            "billing_profile",
            "subscription_id",
            "customer_id",
            "product_id",
            "emi",
            "month_no",
            "due_date",
            "amount",
            "status_snapshot",
            "paid_amount_snapshot",
            "waived_amount_snapshot",
            "outstanding_amount_snapshot",
            "payment_count_snapshot",
            "last_payment_date",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class BillingSyncEventSerializer(serializers.ModelSerializer):
    performed_by_username = serializers.CharField(source="performed_by.username", read_only=True)

    class Meta:
        model = BillingSyncEvent
        fields = [
            "id",
            "billing_profile",
            "source_model",
            "source_id",
            "event_type",
            "status",
            "idempotency_key",
            "payload",
            "synced_at",
            "performed_by",
            "performed_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class BillingProfileSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_code = serializers.CharField(source="product.product_code", read_only=True)
    activation_state_label = serializers.CharField(
        source="get_activation_state_display",
        read_only=True,
    )
    installments = BillingInstallmentMirrorSerializer(many=True, read_only=True)
    latest_sync_event = serializers.SerializerMethodField()

    class Meta:
        model = BillingProfile
        fields = [
            "id",
            "subscription",
            "customer",
            "customer_name",
            "product",
            "product_name",
            "product_code",
            "activation_state",
            "activation_state_label",
            "delivery_gate_required",
            "delivery_gate_status",
            "invoice_eligible",
            "contract_reference_snapshot",
            "contract_start_date",
            "tenure_months",
            "contract_total",
            "monthly_amount",
            "paid_amount_snapshot",
            "waived_amount_snapshot",
            "remaining_amount_snapshot",
            "next_due_date",
            "next_due_amount",
            "product_code_snapshot",
            "product_name_snapshot",
            "activated_at",
            "last_synced_at",
            "last_synced_event",
            "latest_sync_event",
            "installments",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_latest_sync_event(self, obj):
        latest = obj.sync_events.order_by("-synced_at", "-id").first()
        if latest is None:
            return None
        return BillingSyncEventSerializer(latest, context=self.context).data

    def update(self, instance, validated_data):
        sync_subscription_billing_profile(
            subscription_id=instance.subscription_id,
            source_model="BillingProfile",
            source_id=str(instance.id),
            event_type="PROFILE_REFRESH",
            performed_by=self.context["request"].user,
        )
        instance.refresh_from_db()
        return instance
