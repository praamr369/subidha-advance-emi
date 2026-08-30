from unfold.admin import ModelAdmin as UnfoldModelAdmin, TabularInline as UnfoldTabularInline, StackedInline as UnfoldStackedInline
from django.contrib import admin

from billing.models import (
    BillingCreditNote,
    BillingCreditNoteLine,
    BillingDebitNote,
    BillingDebitNoteLine,
    BillingInvoice,
    BillingInvoiceLine,
    DirectSale,
    DirectSaleLine,
    ReceiptDocument,
)


class DirectSaleLineInline(UnfoldTabularInline):
    model = DirectSaleLine
    extra = 0


@admin.register(DirectSale)
class DirectSaleAdmin(UnfoldModelAdmin):
    list_display = ("sale_no", "sale_date", "status", "delivery_required", "grand_total")
    list_filter = ("status", "delivery_required", "sale_date")
    search_fields = ("sale_no", "customer_name_snapshot", "customer_phone_snapshot", "delivery_reference")
    inlines = [DirectSaleLineInline]


class BillingInvoiceLineInline(UnfoldTabularInline):
    model = BillingInvoiceLine
    extra = 0


@admin.register(BillingInvoice)
class BillingInvoiceAdmin(UnfoldModelAdmin):
    list_display = ("document_no", "invoice_date", "status", "billing_channel", "grand_total")
    list_filter = ("status", "billing_channel", "tax_mode", "invoice_date")
    search_fields = ("document_no", "customer_name_snapshot", "customer_phone_snapshot")
    inlines = [BillingInvoiceLineInline]


class BillingCreditNoteLineInline(UnfoldTabularInline):
    model = BillingCreditNoteLine
    extra = 0


@admin.register(BillingCreditNote)
class BillingCreditNoteAdmin(UnfoldModelAdmin):
    list_display = ("note_no", "note_date", "status", "original_invoice", "total_adjustment")
    list_filter = ("status", "stock_effect", "note_date")
    search_fields = ("note_no", "reason")
    inlines = [BillingCreditNoteLineInline]


class BillingDebitNoteLineInline(UnfoldTabularInline):
    model = BillingDebitNoteLine
    extra = 0


@admin.register(BillingDebitNote)
class BillingDebitNoteAdmin(UnfoldModelAdmin):
    list_display = ("note_no", "note_date", "status", "original_invoice", "total_adjustment")
    list_filter = ("status", "stock_effect", "note_date")
    search_fields = ("note_no", "reason")
    inlines = [BillingDebitNoteLineInline]


@admin.register(ReceiptDocument)
class ReceiptDocumentAdmin(UnfoldModelAdmin):
    list_display = ("receipt_no", "receipt_date", "receipt_type", "status", "amount")
    list_filter = ("status", "receipt_type", "receipt_date")
    search_fields = ("receipt_no", "customer_name_snapshot", "customer_phone_snapshot")
