"""Import execution — the only place migration data touches production tables.

Every row import runs in its own transaction, records exactly what it
created/updated on the staging row (target_model/target_pk/prior_state),
and is idempotent: rows already IMPORTED are never re-imported.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, Callable

from django.db import transaction
from django.utils import timezone

from migration_center.datasets import get_dataset
from migration_center.models import (
    DuplicateResolution, MigrationBatch, MigrationBatchStatus,
    MigrationStagingRow, StagingRowStatus,
)
from migration_center.services.pipeline_service import log_action

IMPORT_CHUNK = 200


def _dec(value, default="0") -> Decimal:
    try:
        return Decimal(str(value if value not in ("", None) else default))
    except Exception:
        return Decimal(default)


def _date_or_today(value) -> date:
    if value:
        try:
            return date.fromisoformat(str(value))
        except ValueError:
            pass
    return timezone.now().date()


# ---------------------------------------------------------------------------
# Per-dataset importers. Each returns (target_model, target_pk, extra_targets,
# prior_state) for rollback tracking. ``resolution`` handles duplicates.
# ---------------------------------------------------------------------------

def _import_customer(row: MigrationStagingRow, data: dict[str, Any], actor) -> tuple[str, int, list, dict | None]:
    from subscriptions.models import Customer, CustomerSource
    from customers.services.customer_service import find_or_create_customer, normalize_phone

    resolution = row.duplicate_resolution
    phone = str(data.get("mobile") or "")
    if resolution in (DuplicateResolution.MERGE, DuplicateResolution.UPDATE):
        existing = Customer.objects.filter(phone=normalize_phone(phone)).first()
        if existing is None:
            raise ValueError("Duplicate resolution chose merge/update but no existing customer matches this mobile.")
        prior = {"address": existing.address, "city": existing.city, "district": existing.district,
                 "state": existing.state, "pincode": existing.pincode, "name": existing.name}
        fields = {
            "address": data.get("address") or "", "city": data.get("city") or "",
            "district": data.get("district") or "", "state": data.get("state") or "",
            "pincode": data.get("pin") or "",
        }
        for attr, value in fields.items():
            if resolution == DuplicateResolution.UPDATE and value:
                setattr(existing, attr, value)
            elif resolution == DuplicateResolution.MERGE and value and not getattr(existing, attr):
                setattr(existing, attr, value)
        existing.save()
        return "customers.Customer", existing.pk, [], {"action": "updated", **prior}

    customer, created = find_or_create_customer(
        name=str(data.get("full_name") or ""),
        phone=phone,
        email=str(data.get("email") or ""),
        address=str(data.get("address") or ""),
        city=str(data.get("city") or ""),
        source=CustomerSource.IMPORT,
        created_by=actor,
    )
    if not created and resolution != DuplicateResolution.CREATE_NEW:
        # Existed already (race with duplicate scan) — treat as merge no-op.
        return "customers.Customer", customer.pk, [], {"action": "already_existed"}
    updates: list[str] = []
    for attr, key in (("district", "district"), ("state", "state"), ("pincode", "pin")):
        value = str(data.get(key) or "")
        if value:
            setattr(customer, attr, value)
            updates.append(attr)
    code = str(data.get("customer_code") or "")
    if code and not Customer.objects.filter(customer_code=code).exclude(pk=customer.pk).exists():
        customer.customer_code = code
        updates.append("customer_code")
    if updates:
        customer.save(update_fields=[*updates, "updated_at"] if hasattr(customer, "updated_at") else updates)
    extra = [{"model": "accounts.User", "pk": customer.user_id}] if created else []
    # Opening balance context creates an opening receivable, never an invoice.
    opening = _dec(data.get("opening_balance"))
    ob_type = str(data.get("opening_balance_type") or "DR")
    if created and opening > 0 and ob_type == "DR":
        from accounting.models import CustomerOpeningOutstanding

        outstanding = CustomerOpeningOutstanding.objects.create(
            customer=customer,
            migration_row=row,
            customer_name=customer.name, phone=customer.phone,
            outstanding_amount=opening, entry_date=timezone.now().date(),
            notes=f"Migrated opening balance ({row.batch.batch_number})", created_by=actor,
        )
        extra.append({"model": "accounting.CustomerOpeningOutstanding", "pk": outstanding.pk})
    return "customers.Customer", customer.pk, extra, {"action": "created" if created else "matched"}


def _import_vendor(row: MigrationStagingRow, data: dict[str, Any], actor) -> tuple[str, int, list, dict | None]:
    from accounting.models import Vendor

    resolution = row.duplicate_resolution
    name = str(data.get("vendor_name") or "").strip()
    gst = str(data.get("gst") or "").strip() or None
    existing = None
    if gst:
        existing = Vendor.objects.filter(gstin__iexact=gst).first()
    if existing is None:
        existing = Vendor.objects.filter(name__iexact=name).first()
    if existing is not None and resolution != DuplicateResolution.CREATE_NEW:
        prior = {"phone": existing.phone, "email": existing.email, "address": existing.address}
        if resolution in (DuplicateResolution.MERGE, DuplicateResolution.UPDATE):
            for attr, key in (("phone", "phone"), ("email", "email"), ("address", "address")):
                value = str(data.get(key) or "")
                if value and (resolution == DuplicateResolution.UPDATE or not getattr(existing, attr)):
                    setattr(existing, attr, value)
            existing.save()
            return "accounting.Vendor", existing.pk, [], {"action": "updated", **prior}
        return "accounting.Vendor", existing.pk, [], {"action": "already_existed"}
    vendor = Vendor.objects.create(
        name=name,
        vendor_code=str(data.get("vendor_code") or ""),
        phone=str(data.get("phone") or ""),
        email=str(data.get("email") or ""),
        address=str(data.get("address") or ""),
        gstin=gst,
        status="ACTIVE" if str(data.get("status") or "ACTIVE") == "ACTIVE" else "ARCHIVED",
        notes=f"Migrated via {row.batch.batch_number}",
    )
    extra = []
    opening = _dec(data.get("opening_balance") or data.get("outstanding"))
    if opening > 0:
        entry = _create_vendor_opening_entry(vendor, opening, row, actor, reference="", entry_date=None)
        extra.append({"model": "accounting.VendorLedgerEntry", "pk": entry.pk})
    return "accounting.Vendor", vendor.pk, extra, {"action": "created"}


def _create_vendor_opening_entry(vendor, amount: Decimal, row: MigrationStagingRow, actor, *, reference: str, entry_date):
    from accounting.models import VendorLedgerEntry

    last = vendor.ledger_entries.order_by("-posted_at", "-id").first()
    balance = (last.balance_after if last else Decimal("0")) + amount
    return VendorLedgerEntry.objects.create(
        vendor=vendor,
        entry_type="OPENING_BALANCE",
        source_type="MIGRATION_CENTER",
        source_id=row.pk,
        source_reference=reference or row.batch.batch_number,
        credit=amount,
        balance_after=balance,
        created_by=actor if getattr(actor, "pk", None) else None,
        notes=f"Opening payable migrated via {row.batch.batch_number}",
    )


def _import_product(row: MigrationStagingRow, data: dict[str, Any], actor) -> tuple[str, int, list, dict | None]:
    from subscriptions.models import Product

    resolution = row.duplicate_resolution
    sku = str(data.get("sku") or "").strip() or None
    name = str(data.get("product_name") or "").strip()
    existing = Product.objects.filter(sku__iexact=sku).first() if sku else None
    if existing is None:
        existing = Product.objects.filter(name__iexact=name).first()
    selling_price = _dec(data.get("selling_price") or data.get("mrp"))
    if existing is not None and resolution != DuplicateResolution.CREATE_NEW:
        if resolution == DuplicateResolution.UPDATE:
            prior = {"base_price": str(existing.base_price), "hsn_sac_code": existing.hsn_sac_code}
            if selling_price > 0:
                existing.base_price = selling_price  # base price = total contract price
            if data.get("hsn"):
                existing.hsn_sac_code = str(data.get("hsn"))
            if data.get("gst") not in ("", None):
                existing.gst_rate = _dec(data.get("gst"))
            existing.save()
            return "products_core.Product", existing.pk, [], {"action": "updated", **prior}
        return "products_core.Product", existing.pk, [], {"action": "already_existed"}
    if selling_price <= 0:
        raise ValueError("Selling price (base/contract price) must be greater than zero.")
    code_base = (sku or name or "PRODUCT").upper().replace(" ", "-")[:38]
    product_code = code_base
    counter = 1
    while Product.objects.filter(product_code=product_code).exists():
        counter += 1
        product_code = f"{code_base[:34]}-{counter}"
    product = Product.objects.create(
        product_code=product_code,
        name=name,
        base_price=selling_price,  # business rule: base price is total contract price
        sku=sku if sku and not Product.objects.filter(sku=sku).exists() else None,
        category=str(data.get("category") or ""),
        subcategory=str(data.get("subcategory") or ""),
        unit_of_measure=str(data.get("unit") or "PCS")[:30] or "PCS",
        hsn_sac_code=str(data.get("hsn") or ""),
        gst_rate=_dec(data.get("gst")) if data.get("gst") not in ("", None) else None,
        is_active=str(data.get("status") or "ACTIVE") == "ACTIVE",
        description=f"Migrated via {row.batch.batch_number}",
    )
    return "products_core.Product", product.pk, [], {"action": "created"}


def _import_opening_stock(row: MigrationStagingRow, data: dict[str, Any], actor) -> tuple[str, int, list, dict | None]:
    from inventory.models import InventoryItem, StockLocation
    from inventory.services.opening_stock_entry_service import (
        create_opening_stock_entry, post_opening_stock_entry,
    )
    from subscriptions.models import Product

    ref = str(data.get("product") or "")
    product = (
        Product.objects.filter(sku__iexact=ref).first()
        or Product.objects.filter(product_code__iexact=ref).first()
        or Product.objects.filter(name__iexact=ref).first()
    )
    if product is None:
        raise ValueError(f"Product '{ref}' not found. Import the product master first.")
    item, _ = InventoryItem.objects.get_or_create(product=product)
    warehouse_name = str(data.get("warehouse") or "")
    location = None
    if warehouse_name:
        location = StockLocation.objects.filter(name__iexact=warehouse_name).first()
    if location is None:
        location = item.default_stock_location or StockLocation.objects.filter(is_active=True).order_by("id").first()
    if location is None:
        raise ValueError("No stock location exists. Create a warehouse/location in inventory setup first.")
    note_parts = [f"Migrated via {row.batch.batch_number}"]
    for label, key in (("Serial", "serial"), ("Batch", "batch"), ("Remarks", "remarks")):
        if data.get(key):
            note_parts.append(f"{label}: {data[key]}")
    entry = create_opening_stock_entry(
        inventory_item_id=item.pk,
        stock_location_id=location.pk,
        quantity=_dec(data.get("quantity")),
        effective_date=_date_or_today(data.get("opening_date")),
        unit_cost_snapshot=_dec(data.get("cost")) if data.get("cost") not in ("", None) else None,
        note="; ".join(note_parts),
        created_by=actor,
        source="CSV_IMPORT",
        csv_row_number=row.row_number,
    )
    post_opening_stock_entry(entry_id=entry.pk, posted_by=actor)
    return "inventory.OpeningStockEntry", entry.pk, [], {"action": "created_posted"}


def _import_customer_outstanding(row: MigrationStagingRow, data: dict[str, Any], actor) -> tuple[str, int, list, dict | None]:
    from accounting.models import CustomerOpeningOutstanding
    from subscriptions.models import CustomerSource
    from customers.services.customer_service import find_or_create_customer

    amount = _dec(data.get("outstanding"))
    if amount <= 0:
        raise ValueError("Outstanding amount must be greater than zero.")
    notes = "; ".join(
        part for part in (
            f"Migrated via {row.batch.batch_number}",
            f"Invoice: {data.get('invoice_number')}" if data.get("invoice_number") else "",
            f"Invoice date: {data.get('invoice_date')}" if data.get("invoice_date") else "",
            f"Reference: {data.get('reference')}" if data.get("reference") else "",
            f"Due: {data.get('due_date')}" if data.get("due_date") else "",
            str(data.get("remarks") or ""),
        ) if part
    )
    
    # Create or link CRM customer
    customer_name = str(data.get("customer") or "")
    phone = str(data.get("mobile") or "")
    customer = None
    extra: list[dict] = []
    
    if phone:
        customer, created = find_or_create_customer(
            name=customer_name,
            phone=phone,
            source=CustomerSource.IMPORT,
            created_by=actor,
        )
        if created:
            extra.append({"model": "accounts.User", "pk": customer.user_id})
            extra.append({"model": "customers.Customer", "pk": customer.pk})

    outstanding = CustomerOpeningOutstanding.objects.create(
        customer=customer,
        migration_row=row,
        customer_name=customer_name,
        phone=phone,
        outstanding_amount=amount,
        entry_date=_date_or_today(data.get("invoice_date")),
        notes=notes,
        created_by=actor,
    )
    return "accounting.CustomerOpeningOutstanding", outstanding.pk, extra, {"action": "created"}


def _import_vendor_outstanding(row: MigrationStagingRow, data: dict[str, Any], actor) -> tuple[str, int, list, dict | None]:
    from accounting.models import Vendor

    name = str(data.get("vendor") or "").strip()
    vendor = Vendor.objects.filter(name__iexact=name).first()
    extra: list[dict] = []
    if vendor is None:
        vendor = Vendor.objects.create(name=name, notes=f"Auto-created during migration {row.batch.batch_number}")
        extra.append({"model": "accounting.Vendor", "pk": vendor.pk})
    amount = _dec(data.get("outstanding"))
    if amount <= 0:
        raise ValueError("Outstanding amount must be greater than zero.")
    entry = _create_vendor_opening_entry(
        vendor, amount, row, actor,
        reference=str(data.get("reference") or ""),
        entry_date=data.get("bill_date"),
    )
    return "accounting.VendorLedgerEntry", entry.pk, extra, {"action": "created"}


def _import_finance_opening(row: MigrationStagingRow, data: dict[str, Any], actor) -> tuple[str, int, list, dict | None]:
    from migration_center.services.pipeline_service import _find_finance_account

    account = _find_finance_account(row.batch.dataset_key, str(data.get("account") or ""))
    if account is None:
        raise ValueError(f"Finance account '{data.get('account')}' not found.")
    prior = {"opening_balance": str(account.opening_balance)}
    account.opening_balance = _dec(data.get("opening_balance"))
    account.save(update_fields=["opening_balance", "updated_at"])
    return "accounting.FinanceAccount", account.pk, [], {"action": "updated", **prior}


IMPORTERS: dict[str, Callable[[MigrationStagingRow, dict[str, Any], Any], tuple[str, int, list, dict | None]]] = {
    "customers": _import_customer,
    "vendors": _import_vendor,
    "products": _import_product,
    "opening_stock": _import_opening_stock,
    "customer_outstanding": _import_customer_outstanding,
    "vendor_outstanding": _import_vendor_outstanding,
    "cash_opening_balance": _import_finance_opening,
    "bank_opening_balance": _import_finance_opening,
    "upi_opening_balance": _import_finance_opening,
}


# ---------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------

def approve_batch(*, batch: MigrationBatch, actor=None) -> MigrationBatch:
    if batch.status not in (MigrationBatchStatus.PREVIEWED, MigrationBatchStatus.VALIDATED):
        raise ValueError("Batch must be validated and previewed before approval.")
    if batch.rows.filter(status__in=[StagingRowStatus.VALID, StagingRowStatus.WARNING, StagingRowStatus.DUPLICATE]).count() == 0:
        raise ValueError("Nothing to import: no valid rows in this batch.")
    batch.status = MigrationBatchStatus.APPROVED
    batch.approved_at = timezone.now()
    batch.approved_by = actor
    batch.save(update_fields=["status", "approved_at", "approved_by", "updated_at"])
    log_action(batch=batch, action="APPROVED", actor=actor)
    return batch


def execute_import(*, batch: MigrationBatch, actor=None) -> dict[str, Any]:
    dataset = get_dataset(batch.dataset_key)
    importer = IMPORTERS.get(dataset.key)
    if importer is None:
        raise ValueError(f"Dataset '{dataset.key}' has no importer.")
    if batch.status not in (
        MigrationBatchStatus.APPROVED, MigrationBatchStatus.IMPORTING,
        MigrationBatchStatus.PARTIALLY_IMPORTED, MigrationBatchStatus.IMPORTED,
    ):
        raise ValueError("Batch must be approved before import.")

    batch.status = MigrationBatchStatus.IMPORTING
    if batch.import_started_at is None:
        batch.import_started_at = timezone.now()
    batch.save(update_fields=["status", "import_started_at", "updated_at"])

    imported = skipped = failed = 0
    rows = batch.rows.filter(
        status__in=[StagingRowStatus.VALID, StagingRowStatus.WARNING, StagingRowStatus.DUPLICATE]
    ).order_by("row_number")
    for row in rows.iterator(chunk_size=IMPORT_CHUNK):
        if row.status == StagingRowStatus.DUPLICATE and row.duplicate_resolution == DuplicateResolution.SKIP:
            row.status = StagingRowStatus.SKIPPED
            row.save(update_fields=["status", "updated_at"])
            skipped += 1
            continue
        try:
            with transaction.atomic():
                target_model, target_pk, extra_targets, prior_state = importer(row, row.mapped_data, actor)
                row.target_model = target_model
                row.target_pk = target_pk
                row.extra_targets = extra_targets
                row.prior_state = prior_state
                row.status = StagingRowStatus.IMPORTED
                row.import_error = ""
                row.save(update_fields=[
                    "target_model", "target_pk", "extra_targets", "prior_state",
                    "status", "import_error", "updated_at",
                ])
            imported += 1
        except Exception as exc:
            row.status = StagingRowStatus.FAILED
            row.import_error = str(exc)[:2000]
            row.save(update_fields=["status", "import_error", "updated_at"])
            failed += 1

    batch.imported_rows = batch.rows.filter(status=StagingRowStatus.IMPORTED).count()
    batch.skipped_rows = batch.rows.filter(status=StagingRowStatus.SKIPPED).count()
    batch.failed_rows = batch.rows.filter(status=StagingRowStatus.FAILED).count()
    batch.import_finished_at = timezone.now()
    if batch.failed_rows and batch.imported_rows:
        batch.status = MigrationBatchStatus.PARTIALLY_IMPORTED
    elif batch.failed_rows and not batch.imported_rows:
        batch.status = MigrationBatchStatus.FAILED
    else:
        batch.status = MigrationBatchStatus.IMPORTED
    batch.save(update_fields=[
        "imported_rows", "skipped_rows", "failed_rows", "import_finished_at", "status", "updated_at",
    ])
    result = {
        "batch_number": batch.batch_number, "status": batch.status,
        "imported": imported, "skipped": skipped, "failed": failed,
        "duration_seconds": batch.duration_seconds,
    }
    log_action(batch=batch, action="IMPORT_EXECUTED", actor=actor, payload=result)
    return result
