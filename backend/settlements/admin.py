from django.contrib import admin

from settlements.models import (
    BankStatementImport,
    BankStatementLine,
    CashierDayClose,
    SettlementAllocation,
    UpiSettlementImport,
    UpiSettlementLine,
)


class NoBulkActionsAdmin(admin.ModelAdmin):
    actions = None


@admin.register(BankStatementImport)
class BankStatementImportAdmin(NoBulkActionsAdmin):
    list_display = ("id", "import_no", "bank_finance_account", "statement_period_from", "statement_period_to", "status", "uploaded_at")
    list_filter = ("status", "bank_finance_account", "statement_period_from")
    search_fields = ("import_no", "checksum")
    readonly_fields = ("created_at", "updated_at")


@admin.register(BankStatementLine)
class BankStatementLineAdmin(NoBulkActionsAdmin):
    list_display = ("id", "statement_import", "transaction_date", "debit", "credit", "matched_status")
    list_filter = ("matched_status", "transaction_date")
    search_fields = ("reference_no", "normalized_reference", "description")
    readonly_fields = ("created_at", "updated_at")


@admin.register(UpiSettlementImport)
class UpiSettlementImportAdmin(NoBulkActionsAdmin):
    list_display = ("id", "import_no", "upi_finance_account", "settlement_date", "status", "uploaded_at")
    list_filter = ("status", "upi_finance_account", "settlement_date")
    search_fields = ("import_no", "checksum")
    readonly_fields = ("created_at", "updated_at")


@admin.register(UpiSettlementLine)
class UpiSettlementLineAdmin(NoBulkActionsAdmin):
    list_display = ("id", "settlement_import", "settlement_date", "gross_amount", "fee_amount", "net_amount", "matched_status")
    list_filter = ("matched_status", "settlement_date")
    search_fields = ("transaction_ref", "payment_ref")
    readonly_fields = ("created_at", "updated_at")


@admin.register(CashierDayClose)
class CashierDayCloseAdmin(NoBulkActionsAdmin):
    list_display = ("id", "close_no", "cashier", "branch", "cash_counter", "business_date", "status", "variance")
    list_filter = ("status", "business_date", "branch")
    search_fields = ("close_no", "cashier__username", "cashier__phone")
    readonly_fields = ("created_at", "updated_at")


@admin.register(SettlementAllocation)
class SettlementAllocationAdmin(NoBulkActionsAdmin):
    list_display = ("id", "source_type", "source_id", "finance_account", "matched_amount", "status", "matched_at")
    list_filter = ("status", "source_type", "finance_account")
    search_fields = ("source_id",)
    readonly_fields = ("created_at", "updated_at")

