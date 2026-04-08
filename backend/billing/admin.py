from django.contrib import admin

from billing.models import (
    BillingCreditNote,
    BillingCreditNoteLine,
    BillingDebitNote,
    BillingDebitNoteLine,
    BillingInvoice,
    BillingInvoiceLine,
    ReceiptDocument,
)


class BillingInvoiceLineInline(admin.TabularInline):
    model = BillingInvoiceLine
    extra = 0


@admin.register(BillingInvoice)
class BillingInvoiceAdmin(admin.ModelAdmin):
    list_display = ("document_no", "invoice_date", "status", "billing_channel", "grand_total")
    list_filter = ("status", "billing_channel", "tax_mode", "invoice_date")
    search_fields = ("document_no", "customer_name_snapshot", "customer_phone_snapshot")
    inlines = [BillingInvoiceLineInline]


class BillingCreditNoteLineInline(admin.TabularInline):
    model = BillingCreditNoteLine
    extra = 0


@admin.register(BillingCreditNote)
class BillingCreditNoteAdmin(admin.ModelAdmin):
    list_display = ("note_no", "note_date", "status", "original_invoice", "total_adjustment")
    list_filter = ("status", "stock_effect", "note_date")
    search_fields = ("note_no", "reason")
    inlines = [BillingCreditNoteLineInline]


class BillingDebitNoteLineInline(admin.TabularInline):
    model = BillingDebitNoteLine
    extra = 0


@admin.register(BillingDebitNote)
class BillingDebitNoteAdmin(admin.ModelAdmin):
    list_display = ("note_no", "note_date", "status", "original_invoice", "total_adjustment")
    list_filter = ("status", "stock_effect", "note_date")
    search_fields = ("note_no", "reason")
    inlines = [BillingDebitNoteLineInline]


@admin.register(ReceiptDocument)
class ReceiptDocumentAdmin(admin.ModelAdmin):
    list_display = ("receipt_no", "receipt_date", "receipt_type", "status", "amount")
    list_filter = ("status", "receipt_type", "receipt_date")
    search_fields = ("receipt_no", "customer_name_snapshot", "customer_phone_snapshot")

