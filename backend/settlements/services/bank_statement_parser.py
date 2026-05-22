from __future__ import annotations

import csv
import io
from datetime import datetime, date
from decimal import Decimal, InvalidOperation
from django.db import transaction
from django.core.exceptions import ValidationError
from settlements.models import BankStatementLine, ImportStatus

class CSVParseError(Exception):
    pass

HEADER_MAPPING = {
    "transactiondate": "transaction_date",
    "txndate": "transaction_date",
    "date": "transaction_date",
    "txndate": "transaction_date",
    "dateoftx": "transaction_date",
    "bookingdate": "transaction_date",
    "description": "description",
    "narration": "description",
    "particulars": "description",
    "remarks": "description",
    "debit": "debit",
    "withdrawal": "debit",
    "dr": "debit",
    "amountdebit": "debit",
    "debitamount": "debit",
    "credit": "credit",
    "deposit": "credit",
    "cr": "credit",
    "amountcredit": "credit",
    "creditamount": "credit",
    "valuedate": "value_date",
    "valdate": "value_date",
    "referenceno": "reference_no",
    "reference": "reference_no",
    "refno": "reference_no",
    "ref": "reference_no",
    "utr": "reference_no",
    "chequeno": "reference_no",
    "chequenumber": "reference_no",
    "transactionid": "reference_no",
    "txnid": "reference_no",
    "balance": "balance",
    "bal": "balance",
    "runningbalance": "balance",
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

def normalize_reference(ref: str) -> str | None:
    if not ref:
        return None
    cleaned = "".join(c for c in ref if c.isalnum())
    return cleaned.upper() if cleaned else None

def parse_bank_statement_csv(import_instance) -> None:
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
    required = {"transaction_date", "description", "debit", "credit"}
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

            try:
                txn_date_str = row[header_indices["transaction_date"]]
                txn_date = parse_date(txn_date_str)
            except Exception as e:
                raise CSVParseError(f"Row {row_idx}: Failed to parse transaction_date '{row[header_indices['transaction_date']]}': {e}")

            desc = row[header_indices["description"]].strip()

            try:
                debit = parse_decimal(row[header_indices["debit"]])
            except Exception as e:
                raise CSVParseError(f"Row {row_idx}: Failed to parse debit amount: {e}")

            try:
                credit = parse_decimal(row[header_indices["credit"]])
            except Exception as e:
                raise CSVParseError(f"Row {row_idx}: Failed to parse credit amount: {e}")

            # Basic logic/schema validation (no negative values, no dual sign)
            if debit < 0 or credit < 0:
                raise CSVParseError(f"Row {row_idx}: Debit and credit amounts must be non-negative.")
            if debit > 0 and credit > 0:
                raise CSVParseError(f"Row {row_idx}: Bank statement line cannot have both debit and credit amounts greater than zero.")

            val_date = None
            if "value_date" in header_indices:
                val_date_str = row[header_indices["value_date"]]
                if val_date_str.strip():
                    try:
                        val_date = parse_date(val_date_str)
                    except Exception as e:
                        raise CSVParseError(f"Row {row_idx}: Failed to parse value_date '{val_date_str}': {e}")

            ref_no = None
            if "reference_no" in header_indices:
                ref_no = row[header_indices["reference_no"]].strip()

            balance = None
            if "balance" in header_indices:
                bal_str = row[header_indices["balance"]]
                if bal_str.strip():
                    try:
                        balance = parse_decimal(bal_str)
                    except Exception as e:
                        raise CSVParseError(f"Row {row_idx}: Failed to parse balance: {e}")

            lines_to_create.append(
                BankStatementLine(
                    statement_import=import_instance,
                    transaction_date=txn_date,
                    value_date=val_date,
                    description=desc,
                    reference_no=ref_no,
                    debit=debit,
                    credit=credit,
                    balance=balance,
                    raw_payload=raw_payload,
                    normalized_reference=normalize_reference(ref_no or desc),
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
