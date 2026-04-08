from __future__ import annotations

import json
import os
import tempfile
import zipfile
from datetime import date

from django.db import transaction

from accounting.models import CreditNote, DebitNote, ExportPackJob, ExportPackStatus, ExportPackType, TaxInvoice
from accounting.services.gst_document_posting_service import financial_year_for
from accounting.services.journal_posting_service import _log_accounting_event
from accounting.services.reporting_service import (
    build_balance_sheet,
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
