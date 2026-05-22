from __future__ import annotations

import logging
from django.core.exceptions import ValidationError

from settlements.models import (
    BankStatementImport,
    UpiSettlementImport,
    ImportStatus,
)
from settlements.services.checksum_service import sha256_hex_file
from settlements.services.bank_statement_parser import parse_bank_statement_csv
from settlements.services.upi_settlement_parser import parse_upi_settlement_csv

logger = logging.getLogger(__name__)

def process_bank_statement_import(import_instance: BankStatementImport) -> None:
    # 1. Compute checksum if not set
    if not import_instance.checksum and import_instance.uploaded_file:
        import_instance.checksum = sha256_hex_file(import_instance.uploaded_file) or ""
        import_instance.checksum = import_instance.checksum.strip().lower()

    # 2. Check idempotency / duplicate check
    if import_instance.checksum:
        duplicates = BankStatementImport.objects.filter(
            bank_finance_account=import_instance.bank_finance_account,
            checksum=import_instance.checksum,
            statement_period_from=import_instance.statement_period_from,
            statement_period_to=import_instance.statement_period_to,
        ).exclude(pk=import_instance.pk).exclude(status__in=[ImportStatus.FAILED, ImportStatus.VOIDED])
        if duplicates.exists():
            raise ValidationError("A duplicate bank statement import with the same checksum, finance account, and period already exists.")

    # 3. Save draft progress (status and checksum)
    import_instance.status = ImportStatus.UPLOADED
    import_instance.save()

    # 4. Parse file
    try:
        parse_bank_statement_csv(import_instance)
        # Success
        import_instance.status = ImportStatus.PARSED
        import_instance.save()
    except Exception as e:
        # Failure: Update status and metadata OUTSIDE of failed transaction
        logger.error(f"Failed parsing bank statement import {import_instance.id}: {e}", exc_info=True)
        import_instance.status = ImportStatus.FAILED
        import_instance.metadata = import_instance.metadata or {}
        import_instance.metadata["parse_error"] = str(e)
        import_instance.save()
        raise ValidationError(f"Failed to parse CSV: {e}")

def process_upi_settlement_import(import_instance: UpiSettlementImport) -> None:
    # 1. Compute checksum if not set
    if not import_instance.checksum and import_instance.uploaded_file:
        import_instance.checksum = sha256_hex_file(import_instance.uploaded_file) or ""
        import_instance.checksum = import_instance.checksum.strip().lower()

    # 2. Check idempotency / duplicate check
    if import_instance.checksum:
        duplicates = UpiSettlementImport.objects.filter(
            upi_finance_account=import_instance.upi_finance_account,
            checksum=import_instance.checksum,
            settlement_date=import_instance.settlement_date,
        ).exclude(pk=import_instance.pk).exclude(status__in=[ImportStatus.FAILED, ImportStatus.VOIDED])
        if duplicates.exists():
            raise ValidationError("A duplicate UPI settlement import with the same checksum, finance account, and date already exists.")

    # 3. Save draft progress
    import_instance.status = ImportStatus.UPLOADED
    import_instance.save()

    # 4. Parse file
    try:
        parse_upi_settlement_csv(import_instance)
        # Success
        import_instance.status = ImportStatus.PARSED
        import_instance.save()
    except Exception as e:
        # Failure: Update status and metadata OUTSIDE of failed transaction
        logger.error(f"Failed parsing UPI settlement import {import_instance.id}: {e}", exc_info=True)
        import_instance.status = ImportStatus.FAILED
        import_instance.metadata = import_instance.metadata or {}
        import_instance.metadata["parse_error"] = str(e)
        import_instance.save()
        raise ValidationError(f"Failed to parse CSV: {e}")
