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
from accounts.services.password_reset_service import (
    PasswordResetServiceError,
    create_password_reset_request,
)
from subscriptions.services.customer_service import find_or_create_customer


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


class DirectSaleCollectionSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    receipt_date = serializers.DateField(required=False)
    finance_account_id = serializers.IntegerField(required=False, min_value=1)
    branch_id = serializers.IntegerField(required=False, min_value=1)
    cash_counter_id = serializers.IntegerField(required=False, min_value=1)
    reference_no = serializers.CharField(required=False, allow_blank=True, max_length=100)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate_amount(self, value):
        if _money(value) <= Decimal("0.00"):
            raise serializers.ValidationError("Collection amount must be greater than zero.")
        return _money(value)

    def validate_reference_no(self, value):
        return (value or "").strip()

    def validate_notes(self, value):
        return (value or "").strip()


class DirectSaleLineSerializer(serializers.ModelSerializer):
    product_code = serializers.CharField(source="product.product_code", read_only=True)
    inventory_item_sku = serializers.CharField(source="inventory_item.sku", read_only=True)
    create_purchase_requirement = serializers.BooleanField(write_only=True, required=False, default=False)
    requirement_quantity = serializers.DecimalField(
        max_digits=12,
        decimal_places=3,
        write_only=True,
        required=False,
        allow_null=True,
    )
    requirement_note = serializers.CharField(write_only=True, required=False, allow_blank=True)

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
            "create_purchase_requirement",
            "requirement_quantity",
            "requirement_note",
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
        extra_kwargs = {
            "unit_price": {"required": False},
            "discount_amount": {"required": False},
            "taxable_value": {"required": False},
            "cgst_amount": {"required": False},
            "sgst_amount": {"required": False},
            "igst_amount": {"required": False},
            "line_total": {"required": False},
        }

    def validate(self, attrs):
        attrs = super().validate(attrs)
        product = attrs.get("product") or getattr(getattr(self, "instance", None), "product", None)
        if product is None:
            raise serializers.ValidationError({"product": "Product is required."})

        quantity = Decimal(str(attrs.get("quantity") or "0"))
        if quantity <= Decimal("0.000"):
            raise serializers.ValidationError({"quantity": "Quantity must be greater than zero."})

        unit_price = _money(attrs.get("unit_price") if attrs.get("unit_price") is not None else product.base_price)
        discount_amount = _money(attrs.get("discount_amount"))
        if discount_amount < Decimal("0.00"):
            raise serializers.ValidationError({"discount_amount": "Discount amount cannot be negative."})

        gross = (quantity * unit_price).quantize(Decimal("0.01"))
        if discount_amount > gross:
            raise serializers.ValidationError({"discount_amount": "Discount amount cannot exceed line gross amount."})

        taxable_value = (gross - discount_amount).quantize(Decimal("0.01"))
        gst_rate = Decimal(str(attrs.get("gst_rate") or "0.00"))
        tax_amount = (taxable_value * gst_rate / Decimal("100")).quantize(Decimal("0.01"))
        cgst_amount = _money(attrs.get("cgst_amount")) if "cgst_amount" in attrs else (tax_amount / Decimal("2")).quantize(Decimal("0.01"))
        sgst_amount = _money(attrs.get("sgst_amount")) if "sgst_amount" in attrs else (tax_amount - cgst_amount).quantize(Decimal("0.01"))
        igst_amount = _money(attrs.get("igst_amount")) if "igst_amount" in attrs else Decimal("0.00")
        line_total = (taxable_value + cgst_amount + sgst_amount + igst_amount).quantize(Decimal("0.01"))

        attrs["unit_price"] = unit_price
        attrs["discount_amount"] = discount_amount
        attrs["taxable_value"] = taxable_value
        attrs["cgst_amount"] = cgst_amount
        attrs["sgst_amount"] = sgst_amount
        attrs["igst_amount"] = igst_amount
        attrs["line_total"] = line_total

        requirement_quantity = attrs.get("requirement_quantity")
        if requirement_quantity is not None and Decimal(str(requirement_quantity)) <= Decimal("0.000"):
            raise serializers.ValidationError({"requirement_quantity": "Requirement quantity must be greater than zero."})
        attrs["requirement_note"] = (attrs.get("requirement_note") or "").strip()
        return attrs


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
    branch_code = serializers.CharField(source="branch.code", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    cash_counter_code = serializers.CharField(source="cash_counter.code", read_only=True)
    cash_counter_name = serializers.CharField(source="cash_counter.name", read_only=True)
    finance_account_name = serializers.CharField(source="finance_account.name", read_only=True)
    confirmed_by_username = serializers.CharField(source="confirmed_by.username", read_only=True)
    billing_invoice_id = serializers.SerializerMethodField()
    billing_invoice_no = serializers.SerializerMethodField()
    billing_invoice_status = serializers.SerializerMethodField()
    customer_mode = serializers.ChoiceField(
        choices=[("EXISTING", "Existing Customer"), ("NEW", "New Customer"), ("WALK_IN", "Walk-in Snapshot")],
        required=False,
        write_only=True,
        default="EXISTING",
    )
    walkin_create_customer_profile = serializers.BooleanField(required=False, write_only=True, default=False)
    new_customer_name = serializers.CharField(required=False, allow_blank=True, write_only=True)
    new_customer_phone = serializers.CharField(required=False, allow_blank=True, write_only=True)
    new_customer_email = serializers.EmailField(required=False, allow_blank=True, write_only=True)
    new_customer_billing_address_line1 = serializers.CharField(required=False, allow_blank=True, write_only=True)
    new_customer_billing_address_line2 = serializers.CharField(required=False, allow_blank=True, write_only=True)
    new_customer_city = serializers.CharField(required=False, allow_blank=True, write_only=True)
    new_customer_district = serializers.CharField(required=False, allow_blank=True, write_only=True)
    new_customer_state = serializers.CharField(required=False, allow_blank=True, write_only=True)
    new_customer_pincode = serializers.CharField(required=False, allow_blank=True, write_only=True)
    new_customer_gstin = serializers.CharField(required=False, allow_blank=True, write_only=True)
    new_customer_type = serializers.ChoiceField(
        choices=[("UNREGISTERED_CONSUMER", "Unregistered Consumer"), ("REGISTERED_BUSINESS", "Registered Business")],
        required=False,
        write_only=True,
    )
    terms = serializers.CharField(required=False, allow_blank=True, write_only=True)

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
            "branch",
            "branch_code",
            "branch_name",
            "cash_counter",
            "cash_counter_code",
            "cash_counter_name",
            "status",
            "tax_mode",
            "tax_calculation_mode",
            "customer_gst_type",
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
            "customer_snapshot_email",
            "customer_snapshot_billing_address_line1",
            "customer_snapshot_billing_address_line2",
            "customer_snapshot_city",
            "customer_snapshot_district",
            "customer_snapshot_state",
            "customer_snapshot_pincode",
            "customer_gstin",
            "customer_snapshot_place_of_supply",
            "delivery_snapshot_address_line1",
            "delivery_snapshot_address_line2",
            "delivery_snapshot_city",
            "delivery_snapshot_district",
            "delivery_snapshot_state",
            "delivery_snapshot_pincode",
            "notes",
            "billing_invoice_id",
            "billing_invoice_no",
            "billing_invoice_status",
            "customer_mode",
            "walkin_create_customer_profile",
            "new_customer_name",
            "new_customer_phone",
            "new_customer_email",
            "new_customer_billing_address_line1",
            "new_customer_billing_address_line2",
            "new_customer_city",
            "new_customer_district",
            "new_customer_state",
            "new_customer_pincode",
            "new_customer_gstin",
            "new_customer_type",
            "terms",
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
        lines = attrs.get("lines")
        if instance is None and not lines:
            raise serializers.ValidationError({"lines": "At least one product line is required."})
        _validate_invoice_lines(lines or [], attrs)
        tax_mode = attrs.get("tax_mode") or getattr(instance, "tax_mode", "NON_GST")
        customer_gst_type = attrs.get("customer_gst_type") or getattr(
            instance, "customer_gst_type", "UNREGISTERED_CONSUMER"
        )
        gstin = (attrs.get("customer_gstin") or "").strip()
        place_of_supply = (attrs.get("customer_snapshot_place_of_supply") or "").strip()
        if tax_mode == "GST" and customer_gst_type == "REGISTERED_BUSINESS" and not gstin:
            raise serializers.ValidationError(
                {"customer_gstin": "GSTIN is required for registered business GST invoices."}
            )
        if tax_mode == "GST" and not place_of_supply:
            raise serializers.ValidationError(
                {"customer_snapshot_place_of_supply": "Place of supply is required for GST invoices."}
            )
        return attrs

    def create(self, validated_data):
        self._resolve_customer_mode(validated_data)
        return create_direct_sale(
            payload=validated_data,
            created_by=self.context["request"].user,
        )

    def update(self, instance, validated_data):
        self._resolve_customer_mode(validated_data)
        return update_direct_sale(
            direct_sale_id=instance.id,
            payload=validated_data,
            updated_by=self.context["request"].user,
        )

    def _resolve_customer_mode(self, validated_data: dict) -> None:
        request = self.context["request"]
        customer_mode = validated_data.pop("customer_mode", "EXISTING")
        walkin_create_customer_profile = bool(validated_data.pop("walkin_create_customer_profile", False))
        new_customer_name = (validated_data.pop("new_customer_name", "") or "").strip()
        new_customer_phone = (validated_data.pop("new_customer_phone", "") or "").strip()
        new_customer_email = (validated_data.pop("new_customer_email", "") or "").strip()
        new_customer_address1 = (validated_data.pop("new_customer_billing_address_line1", "") or "").strip()
        validated_data.pop("new_customer_billing_address_line2", "")
        new_customer_city = (validated_data.pop("new_customer_city", "") or "").strip()
        validated_data.pop("new_customer_district", "")
        validated_data.pop("new_customer_state", "")
        validated_data.pop("new_customer_pincode", "")
        new_customer_gstin = (validated_data.pop("new_customer_gstin", "") or "").strip()
        validated_data.pop("terms", "")
        new_customer_type = (
            validated_data.pop("new_customer_type", "")
            or validated_data.get("customer_gst_type")
            or "UNREGISTERED_CONSUMER"
        )
        if new_customer_type:
            validated_data["customer_gst_type"] = new_customer_type

        if customer_mode == "EXISTING":
            if not validated_data.get("customer"):
                raise serializers.ValidationError(
                    {"customer": "Existing customer mode requires selecting a registered customer."}
                )
            return

        if customer_mode == "NEW" or (customer_mode == "WALK_IN" and walkin_create_customer_profile):
            if customer_mode == "WALK_IN" and not new_customer_name:
                new_customer_name = (validated_data.get("customer_name_snapshot") or "").strip()
            if customer_mode == "WALK_IN" and not new_customer_phone:
                new_customer_phone = (validated_data.get("customer_phone_snapshot") or "").strip()
            field_errors = {}
            if not new_customer_name:
                field_errors["new_customer_name"] = "New customer full name is required."
            if not new_customer_phone:
                field_errors["new_customer_phone"] = "New customer phone is required."
            if field_errors:
                raise serializers.ValidationError(field_errors)
            customer, created = find_or_create_customer(
                name=new_customer_name,
                phone=new_customer_phone,
                email=new_customer_email,
                address=new_customer_address1,
                city=new_customer_city,
                created_by=request.user,
            )
            validated_data["customer"] = customer
            validated_data["customer_name_snapshot"] = customer.name
            validated_data["customer_phone_snapshot"] = customer.phone
            validated_data["customer_snapshot_email"] = new_customer_email or (customer.user.email or "")
            validated_data["customer_snapshot_billing_address_line1"] = new_customer_address1 or customer.address
            validated_data["customer_snapshot_city"] = new_customer_city or customer.city
            if new_customer_gstin:
                validated_data["customer_gstin"] = new_customer_gstin.upper()

            if created:
                customer.user.set_unusable_password()
                customer.user.save(update_fields=["password"])
                identifier = (customer.user.email or customer.phone or customer.user.username or "").strip()
                if identifier:
                    try:
                        create_password_reset_request(identifier=identifier)
                    except (PasswordResetServiceError, ValueError):
                        pass
        elif customer_mode == "WALK_IN":
            validated_data["customer"] = None
            field_errors = {}
            if not (validated_data.get("customer_name_snapshot") or "").strip():
                field_errors["customer_name_snapshot"] = "Walk-in snapshot name is required."
            if not (validated_data.get("customer_phone_snapshot") or "").strip():
                field_errors["customer_phone_snapshot"] = "Walk-in snapshot phone is required."
            if field_errors:
                raise serializers.ValidationError(field_errors)

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
    branch_code = serializers.CharField(source="branch.code", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
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
            "branch",
            "branch_code",
            "branch_name",
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
    branch_code = serializers.CharField(source="branch.code", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    cash_counter_code = serializers.CharField(source="cash_counter.code", read_only=True)
    cash_counter_name = serializers.CharField(source="cash_counter.name", read_only=True)
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
            "branch",
            "branch_code",
            "branch_name",
            "cash_counter",
            "cash_counter_code",
            "cash_counter_name",
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
            branch_id=getattr(validated_data.get("branch"), "id", None),
            cash_counter_id=getattr(validated_data.get("cash_counter"), "id", None),
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
