from __future__ import annotations

import csv
import io
import json
import os
import tempfile
import zipfile
from calendar import monthrange
from datetime import date

from django.db import transaction

from accounting.models import CreditNote, DebitNote, ExportPackJob, ExportPackStatus, ExportPackType, TaxInvoice
from accounting.services.gst_document_posting_service import financial_year_for
from accounting.services.journal_posting_service import _log_accounting_event
from accounting.services.reporting_service import (
    build_balance_sheet,
    build_finance_book,
    build_general_ledger,
    build_profit_loss,
    build_trial_balance,
)


def _date(value):
    return value.isoformat() if value else None


@transaction.atomic
def create_itr_export_pack_job(
    *,
    financial_year: str = "",
    start_date: date | None = None,
    end_date: date | None = None,
    created_by=None,
) -> ExportPackJob:
    effective_end_date = end_date or date.today()
    job = ExportPackJob.objects.create(
        pack_type=ExportPackType.ITR_HANDOFF,
        financial_year=financial_year or financial_year_for(effective_end_date),
        start_date=start_date,
        end_date=end_date,
        created_by=created_by,
        status=ExportPackStatus.QUEUED,
    )
    _log_accounting_event(
        event="ACCOUNTING_ITR_EXPORT_QUEUED",
        instance=job,
        performed_by=created_by,
        metadata={
            "financial_year": job.financial_year,
            "start_date": _date(job.start_date),
            "end_date": _date(job.end_date),
        },
    )
    return job


def generate_itr_export_pack(*, job_id: int) -> ExportPackJob:
    job = ExportPackJob.objects.get(pk=job_id)
    job.status = ExportPackStatus.RUNNING
    job.error_message = ""
    job.save(update_fields=["status", "error_message", "updated_at"])

    try:
        trial_balance = build_trial_balance(
            start_date=job.start_date,
            end_date=job.end_date,
        )
        profit_loss = build_profit_loss(
            start_date=job.start_date,
            end_date=job.end_date,
        )
        balance_sheet = build_balance_sheet(as_of=job.end_date or date.today())
        export_dir = os.path.join(tempfile.gettempdir(), "subidha-accounting-exports")
        os.makedirs(export_dir, exist_ok=True)
        export_path = os.path.join(export_dir, f"itr-pack-{job.id}.zip")

        with zipfile.ZipFile(export_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("trial_balance.json", json.dumps(trial_balance, indent=2))
            archive.writestr("profit_loss.json", json.dumps(profit_loss, indent=2))
            archive.writestr("balance_sheet.json", json.dumps(balance_sheet, indent=2))
            archive.writestr(
                "general_ledger_summary.json",
                json.dumps(
                    {
                        "generated_for": job.financial_year,
                        "note": "Use the general ledger endpoint for account-specific drilldown.",
                    },
                    indent=2,
                ),
            )

        job.file_path = export_path
        job.status = ExportPackStatus.DONE
        job.save(update_fields=["file_path", "status", "updated_at"])
        _log_accounting_event(
            event="ACCOUNTING_ITR_EXPORT_DONE",
            instance=job,
            performed_by=job.created_by,
            metadata={"file_path": export_path},
        )
    except Exception as exc:  # pragma: no cover - failure path tested through state
        job.status = ExportPackStatus.FAILED
        job.error_message = str(exc)
        job.save(update_fields=["status", "error_message", "updated_at"])
        _log_accounting_event(
            event="ACCOUNTING_ITR_EXPORT_FAILED",
            instance=job,
            performed_by=job.created_by,
            metadata={"error": str(exc)},
        )
        raise

    return job


@transaction.atomic
def create_gst_export_pack_job(
    *,
    financial_year: str = "",
    start_date: date | None = None,
    end_date: date | None = None,
    created_by=None,
) -> ExportPackJob:
    effective_end_date = end_date or date.today()
    job = ExportPackJob.objects.create(
        pack_type=ExportPackType.GST_HANDOFF,
        financial_year=financial_year or financial_year_for(effective_end_date),
        start_date=start_date,
        end_date=end_date,
        created_by=created_by,
        status=ExportPackStatus.QUEUED,
    )
    _log_accounting_event(
        event="ACCOUNTING_GST_EXPORT_QUEUED",
        instance=job,
        performed_by=created_by,
        metadata={
            "financial_year": job.financial_year,
            "start_date": _date(job.start_date),
            "end_date": _date(job.end_date),
        },
    )
    return job


def generate_gst_export_pack(*, job_id: int) -> ExportPackJob:
    job = ExportPackJob.objects.get(pk=job_id)
    job.status = ExportPackStatus.RUNNING
    job.error_message = ""
    job.save(update_fields=["status", "error_message", "updated_at"])

    try:
        invoice_qs = TaxInvoice.objects.filter(
            invoice_date__gte=job.start_date or date.min,
            invoice_date__lte=job.end_date or date.today(),
        ).values(
            "invoice_no",
            "invoice_date",
            "recipient_name",
            "recipient_gstin",
            "subtotal_taxable",
            "cgst_amount",
            "sgst_amount",
            "igst_amount",
            "total_amount",
            "status",
        )
        credit_qs = CreditNote.objects.filter(
            note_date__gte=job.start_date or date.min,
            note_date__lte=job.end_date or date.today(),
        ).values(
            "note_no",
            "note_date",
            "original_invoice__invoice_no",
            "taxable_adjustment",
            "tax_adjustment",
            "total_adjustment",
            "status",
        )
        debit_qs = DebitNote.objects.filter(
            note_date__gte=job.start_date or date.min,
            note_date__lte=job.end_date or date.today(),
        ).values(
            "note_no",
            "note_date",
            "original_invoice__invoice_no",
            "taxable_adjustment",
            "tax_adjustment",
            "total_adjustment",
            "status",
        )
        export_dir = os.path.join(tempfile.gettempdir(), "subidha-accounting-exports")
        os.makedirs(export_dir, exist_ok=True)
        export_path = os.path.join(export_dir, f"gst-pack-{job.id}.zip")

        with zipfile.ZipFile(export_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("tax_invoices.json", json.dumps(list(invoice_qs), indent=2, default=str))
            archive.writestr("credit_notes.json", json.dumps(list(credit_qs), indent=2, default=str))
            archive.writestr("debit_notes.json", json.dumps(list(debit_qs), indent=2, default=str))

        job.file_path = export_path
        job.status = ExportPackStatus.DONE
        job.save(update_fields=["file_path", "status", "updated_at"])
        _log_accounting_event(
            event="ACCOUNTING_GST_EXPORT_DONE",
            instance=job,
            performed_by=job.created_by,
            metadata={"file_path": export_path},
        )
    except Exception as exc:  # pragma: no cover
        job.status = ExportPackStatus.FAILED
        job.error_message = str(exc)
        job.save(update_fields=["status", "error_message", "updated_at"])
        _log_accounting_event(
            event="ACCOUNTING_GST_EXPORT_FAILED",
            instance=job,
            performed_by=job.created_by,
            metadata={"error": str(exc)},
        )
        raise

    return job


def generate_ca_month_end_pack(*, year: int, month: int, created_by=None) -> tuple[str, bytes]:
    """Generate an in-memory monthly CA export pack containing:
    1. GSTR1_Sales (Tax invoices + Credit notes)
    2. GSTR2_Purchases (Purchase bills)
    3. Cash_Bank_Book (All cash, bank, and UPI ledger movements)
    4. Trial_Balance (Monthly trial balance)
    5. README.txt

    Returns (filename, zip_bytes). Read-only; no financial records are mutated.
    """
    _, last_day = monthrange(year, month)
    start_date = date(year, month, 1)
    end_date = date(year, month, last_day)
    tag = f"{year}_{month:02d}"

    # 1. GSTR1 Sales CSV
    gstr1_io = io.StringIO()
    gstr1_writer = csv.writer(gstr1_io)
    gstr1_writer.writerow([
        "Invoice / Note No",
        "Type",
        "Date",
        "Recipient Name",
        "Recipient GSTIN",
        "Taxable Value",
        "CGST",
        "SGST",
        "IGST",
        "Total Amount",
        "Status",
    ])
    for inv in TaxInvoice.objects.filter(invoice_date__gte=start_date, invoice_date__lte=end_date).order_by("invoice_date", "id"):
        gstr1_writer.writerow([
            inv.invoice_no,
            "TAX_INVOICE",
            inv.invoice_date.isoformat() if inv.invoice_date else "",
            inv.recipient_name,
            inv.recipient_gstin or "",
            f"{inv.subtotal_taxable:.2f}",
            f"{inv.cgst_amount:.2f}",
            f"{inv.sgst_amount:.2f}",
            f"{inv.igst_amount:.2f}",
            f"{inv.total_amount:.2f}",
            inv.status,
        ])
    for cn in CreditNote.objects.filter(note_date__gte=start_date, note_date__lte=end_date).order_by("note_date", "id"):
        gstr1_writer.writerow([
            cn.note_no,
            "CREDIT_NOTE",
            cn.note_date.isoformat() if cn.note_date else "",
            getattr(cn.original_invoice, "recipient_name", "") or "",
            getattr(cn.original_invoice, "recipient_gstin", "") or "",
            f"-{cn.taxable_adjustment:.2f}",
            f"-{cn.tax_adjustment:.2f}",
            "0.00",
            "0.00",
            f"-{cn.total_adjustment:.2f}",
            cn.status,
        ])

    # 2. GSTR2 Purchases CSV
    gstr2_io = io.StringIO()
    gstr2_writer = csv.writer(gstr2_io)
    gstr2_writer.writerow([
        "Bill No",
        "Date",
        "Vendor Name",
        "Vendor GSTIN",
        "Tax Mode",
        "Subtotal",
        "Tax Total",
        "Grand Total",
        "Status",
    ])
    try:
        from inventory.models import PurchaseBill
        for bill in PurchaseBill.objects.select_related("vendor").filter(bill_date__gte=start_date, bill_date__lte=end_date).order_by("bill_date", "id"):
            gstr2_writer.writerow([
                bill.bill_no,
                bill.bill_date.isoformat() if bill.bill_date else "",
                getattr(bill.vendor, "name", "") or "",
                getattr(bill.vendor, "gstin", "") or "",
                bill.tax_mode,
                f"{bill.subtotal:.2f}",
                f"{bill.tax_total:.2f}",
                f"{bill.grand_total:.2f}",
                bill.status,
            ])
    except Exception:
        pass

    # 3. Cash & Bank Book CSV
    cash_bank_io = io.StringIO()
    cash_bank_writer = csv.writer(cash_bank_io)
    cash_bank_writer.writerow([
        "Date",
        "Entry No",
        "Account / Party",
        "Description",
        "Debit",
        "Credit",
    ])
    try:
        book_data = build_finance_book(kinds=["CASH", "BANK", "UPI"], start_date=start_date, end_date=end_date)
        for row in book_data.get("rows", []):
            cash_bank_writer.writerow([
                row.get("date", ""),
                row.get("entry_number", ""),
                row.get("chart_account_name", ""),
                row.get("description", ""),
                f"{row.get('debit_amount', 0):.2f}",
                f"{row.get('credit_amount', 0):.2f}",
            ])
    except Exception:
        pass

    # 4. Trial Balance CSV
    tb_io = io.StringIO()
    tb_writer = csv.writer(tb_io)
    tb_writer.writerow([
        "Account Code",
        "Account Name",
        "Group",
        "Opening Debit",
        "Opening Credit",
        "Period Debit",
        "Period Credit",
        "Closing Debit",
        "Closing Credit",
    ])
    try:
        tb_data = build_trial_balance(start_date=start_date, end_date=end_date)
        for row in tb_data.get("rows", []):
            tb_writer.writerow([
                row.get("account_code", ""),
                row.get("account_name", ""),
                row.get("group_name", ""),
                f"{row.get('opening_debit', 0):.2f}",
                f"{row.get('opening_credit', 0):.2f}",
                f"{row.get('period_debit', 0):.2f}",
                f"{row.get('period_credit', 0):.2f}",
                f"{row.get('closing_debit', 0):.2f}",
                f"{row.get('closing_credit', 0):.2f}",
            ])
    except Exception:
        pass

    # Package into in-memory ZIP
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(f"GSTR1_Sales_{tag}.csv", gstr1_io.getvalue().encode("utf-8"))
        archive.writestr(f"GSTR2_Purchases_{tag}.csv", gstr2_io.getvalue().encode("utf-8"))
        archive.writestr(f"Cash_Bank_Book_{tag}.csv", cash_bank_io.getvalue().encode("utf-8"))
        archive.writestr(f"Trial_Balance_{tag}.csv", tb_io.getvalue().encode("utf-8"))
        archive.writestr(
            "README.txt",
            f"SUBIDHA CORE — CA Month-End Financial Pack\n"
            f"Period: {start_date.isoformat()} to {end_date.isoformat()}\n"
            f"Generated on: {date.today().isoformat()}\n"
            f"Includes GSTR-1 Sales, GSTR-2 Purchases, Cash/Bank/UPI Ledgers, and Monthly Trial Balance.\n",
        )

    filename = f"Subidha_CA_Pack_{tag}.zip"
    return filename, zip_buffer.getvalue()
