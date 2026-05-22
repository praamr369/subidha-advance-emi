from __future__ import annotations

import csv
import io
from datetime import datetime, date
from decimal import Decimal, InvalidOperation
from django.db import transaction
from django.core.exceptions import ValidationError
from settlements.models import UpiSettlementLine, ImportStatus

class CSVParseError(Exception):
    pass

HEADER_MAPPING = {
    "transactionref": "transaction_ref",
    "txnref": "transaction_ref",
    "transactionid": "transaction_ref",
    "txnid": "transaction_ref",
    "paymentid": "transaction_ref",
    "settlementref": "transaction_ref",
    "transactionreference": "transaction_ref",
    "grossamount": "gross_amount",
    "gross": "gross_amount",
    "amount": "gross_amount",
    "grossamt": "gross_amount",
    "netamount": "net_amount",
    "net": "net_amount",
    "netamt": "net_amount",
    "settlementdate": "settlement_date",
    "settleddate": "settlement_date",
    "date": "settlement_date",
    "paymentref": "payment_ref",
    "paymentreference": "payment_ref",
    "feeamount": "fee_amount",
    "fee": "fee_amount",
    "feeamt": "fee_amount",
    "charges": "fee_amount",
}

def parse_date(date_str: str) -> date:
    if not date_str:
        return None
    date_str = date_str.strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d.%m.%Y", "%b %d, %Y", "%d %b %Y"):
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Unable to parse date string: '{date_str}'")

def parse_decimal(val_str: str) -> Decimal:
    if not val_str:
        return Decimal("0.00")
    val_str = val_str.strip().replace(",", "")
    for sym in ("$", "₹", "£", "€"):
        val_str = val_str.replace(sym, "")
    val_str = val_str.strip()
    if not val_str or val_str == "-":
        return Decimal("0.00")
    try:
        return Decimal(val_str)
    except InvalidOperation:
        raise ValueError(f"Unable to parse decimal: '{val_str}'")

def parse_upi_settlement_csv(import_instance) -> None:
    uploaded_file = import_instance.uploaded_file
    if not uploaded_file:
        raise CSVParseError("No file uploaded on import instance.")

    try:
        uploaded_file.seek(0)
        content = uploaded_file.read()
        if isinstance(content, bytes):
            try:
                decoded = content.decode("utf-8")
            except UnicodeDecodeError:
                decoded = content.decode("latin-1")
        else:
            decoded = content
    except Exception as e:
        raise CSVParseError(f"Failed to read file content: {e}")

    f = io.StringIO(decoded)
    reader = csv.reader(f)

    # Find the header row
    raw_headers = None
    for row in reader:
        if any(row):
            raw_headers = row
            break

    if not raw_headers:
        raise CSVParseError("CSV file is empty or has no header row.")

    normalized_headers = []
    for h in raw_headers:
        h_norm = h.strip().lower().replace("_", "").replace(" ", "").replace("-", "")
        mapped = HEADER_MAPPING.get(h_norm)
        normalized_headers.append(mapped)

    # Validate required headers
    required = {"transaction_ref", "gross_amount", "net_amount", "settlement_date"}
    missing = required - set(normalized_headers)
    if missing:
        raise CSVParseError(f"Missing required columns in CSV: {', '.join(missing)}")

    # Map headers to indices
    header_indices = {}
    for idx, name in enumerate(normalized_headers):
        if name and name not in header_indices:
            header_indices[name] = idx

    lines_to_create = []
    try:
        for row_idx, row in enumerate(reader, start=2):
            if not row or not any(row):
                continue

            # Pad row if columns are shorter than headers
            if len(row) < len(raw_headers):
                row = row + [""] * (len(raw_headers) - len(row))

            raw_payload = {raw_headers[i]: row[i] for i in range(min(len(row), len(raw_headers)))}

            txn_ref = row[header_indices["transaction_ref"]].strip()
            if not txn_ref:
                raise CSVParseError(f"Row {row_idx}: Missing transaction_ref.")

            try:
                settlement_date_str = row[header_indices["settlement_date"]]
                settlement_date = parse_date(settlement_date_str)
            except Exception as e:
                raise CSVParseError(f"Row {row_idx}: Failed to parse settlement_date '{row[header_indices['settlement_date']]}': {e}")

            if import_instance.settlement_date and settlement_date != import_instance.settlement_date:
                raise CSVParseError(
                    f"Row {row_idx}: settlement_date '{settlement_date.isoformat()}' does not match import settlement_date '{import_instance.settlement_date.isoformat()}'."
                )

            try:
                gross_amount = parse_decimal(row[header_indices["gross_amount"]])
            except Exception as e:
                raise CSVParseError(f"Row {row_idx}: Failed to parse gross amount: {e}")

            try:
                net_amount = parse_decimal(row[header_indices["net_amount"]])
            except Exception as e:
                raise CSVParseError(f"Row {row_idx}: Failed to parse net amount: {e}")

            if gross_amount < 0 or net_amount < 0:
                raise CSVParseError(f"Row {row_idx}: Amounts must be non-negative.")

            payment_ref = None
            if "payment_ref" in header_indices:
                payment_ref = row[header_indices["payment_ref"]].strip()

            fee_amount = Decimal("0.00")
            if "fee_amount" in header_indices:
                fee_str = row[header_indices["fee_amount"]]
                if fee_str.strip():
                    try:
                        fee_amount = parse_decimal(fee_str)
                    except Exception as e:
                        raise CSVParseError(f"Row {row_idx}: Failed to parse fee amount: {e}")
            if fee_amount < 0:
                raise CSVParseError(f"Row {row_idx}: Fee amount must be non-negative.")

            lines_to_create.append(
                UpiSettlementLine(
                    settlement_import=import_instance,
                    transaction_ref=txn_ref,
                    payment_ref=payment_ref,
                    gross_amount=gross_amount,
                    fee_amount=fee_amount,
                    net_amount=net_amount,
                    settlement_date=settlement_date,
                    raw_payload=raw_payload,
                )
            )
    except CSVParseError:
        raise
    except Exception as e:
        raise CSVParseError(f"Parsing error: {e}")

    if not lines_to_create:
        raise CSVParseError("No valid rows found to parse.")

    # Save lines in transaction
    with transaction.atomic():
        for line in lines_to_create:
            line.save()
