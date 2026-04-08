from django.contrib import admin

from accounting.models import (
    AccountingBridgePosting,
    ChartOfAccount,
    CreditNote,
    DebitNote,
    DocumentSequence,
    EmployeeProfile,
    ExpenseVoucher,
    ExportPackJob,
    FinanceAccount,
    JournalEntry,
    JournalEntryLine,
    MoneyMovement,
    SalaryPayment,
    SalarySheet,
    TaxInvoice,
    TaxInvoiceLine,
    Vendor,
)


@admin.register(ChartOfAccount)
class ChartOfAccountAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "account_type", "system_code", "is_active")
    search_fields = ("code", "name", "system_code")
    list_filter = ("account_type", "is_active")


@admin.register(FinanceAccount)
class FinanceAccountAdmin(admin.ModelAdmin):
    list_display = ("name", "kind", "chart_account", "opening_balance", "is_active")
    search_fields = ("name", "upi_handle", "bank_last4")
    list_filter = ("kind", "is_active")


class JournalEntryLineInline(admin.TabularInline):
    model = JournalEntryLine
    extra = 0


@admin.register(JournalEntry)
class JournalEntryAdmin(admin.ModelAdmin):
    list_display = ("entry_no", "entry_date", "entry_type", "status", "posted_by")
    search_fields = ("entry_no", "memo", "source_model", "source_id")
    list_filter = ("entry_type", "status")
    inlines = [JournalEntryLineInline]


@admin.register(Vendor)
class VendorAdmin(admin.ModelAdmin):
    list_display = ("name", "gstin", "phone", "email", "is_active")
    search_fields = ("name", "gstin", "phone", "email")
    list_filter = ("is_active",)


@admin.register(ExpenseVoucher)
class ExpenseVoucherAdmin(admin.ModelAdmin):
    list_display = ("voucher_no", "expense_date", "vendor", "net_amount", "status")
    search_fields = ("voucher_no", "bill_no", "vendor__name")
    list_filter = ("status", "payment_mode")


@admin.register(EmployeeProfile)
class EmployeeProfileAdmin(admin.ModelAdmin):
    list_display = ("employee_code", "name", "joining_date", "is_active")
    search_fields = ("employee_code", "name")
    list_filter = ("is_active",)


@admin.register(SalarySheet)
class SalarySheetAdmin(admin.ModelAdmin):
    list_display = ("employee", "year", "month", "net_amount", "status")
    search_fields = ("employee__employee_code", "employee__name")
    list_filter = ("status", "year", "month")


@admin.register(SalaryPayment)
class SalaryPaymentAdmin(admin.ModelAdmin):
    list_display = ("salary_sheet", "payment_date", "amount", "finance_account")
    search_fields = ("reference_no", "salary_sheet__employee__name")


@admin.register(MoneyMovement)
class MoneyMovementAdmin(admin.ModelAdmin):
    list_display = ("movement_no", "movement_date", "from_finance_account", "to_finance_account", "amount", "status")
    search_fields = ("movement_no", "reference_no", "notes")
    list_filter = ("status",)


@admin.register(AccountingBridgePosting)
class AccountingBridgePostingAdmin(admin.ModelAdmin):
    list_display = ("source_model", "source_id", "purpose", "journal_entry", "created_at")
    search_fields = ("source_model", "source_id", "purpose", "journal_entry__entry_no")
    list_filter = ("purpose",)


@admin.register(DocumentSequence)
class DocumentSequenceAdmin(admin.ModelAdmin):
    list_display = ("series_code", "financial_year", "prefix", "next_number", "is_active")
    search_fields = ("series_code", "financial_year", "prefix")
    list_filter = ("is_active",)


class TaxInvoiceLineInline(admin.TabularInline):
    model = TaxInvoiceLine
    extra = 0


@admin.register(TaxInvoice)
class TaxInvoiceAdmin(admin.ModelAdmin):
    list_display = ("invoice_no", "invoice_date", "recipient_name", "total_amount", "status")
    search_fields = ("invoice_no", "recipient_name", "recipient_gstin", "supplier_gstin")
    list_filter = ("status", "supply_kind")
    inlines = [TaxInvoiceLineInline]


@admin.register(CreditNote)
class CreditNoteAdmin(admin.ModelAdmin):
    list_display = ("note_no", "note_date", "original_invoice", "total_adjustment", "status")
    search_fields = ("note_no", "original_invoice__invoice_no", "reason")
    list_filter = ("status",)


@admin.register(DebitNote)
class DebitNoteAdmin(admin.ModelAdmin):
    list_display = ("note_no", "note_date", "original_invoice", "total_adjustment", "status")
    search_fields = ("note_no", "original_invoice__invoice_no", "reason")
    list_filter = ("status",)


@admin.register(ExportPackJob)
class ExportPackJobAdmin(admin.ModelAdmin):
    list_display = ("id", "pack_type", "financial_year", "status", "created_by", "created_at")
    search_fields = ("financial_year", "file_path", "created_by__username")
    list_filter = ("pack_type", "status")
