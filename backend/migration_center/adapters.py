"""Source adapters.

An adapter knows how a particular legacy product names its export columns
and can pre-seed the field mapping. No adapter writes to the database.
Adding support for a new legacy system = subclass + register. Nothing in
the pipeline is myBillBook-specific.
"""

from __future__ import annotations

from migration_center.datasets import DatasetSpec, auto_map_headers
from migration_center.models import MigrationSourceType


class SourceAdapter:
    """Base adapter: generic synonym-based header detection."""

    source_type: str = MigrationSourceType.GENERIC_CSV
    label: str = "Generic CSV"
    # {dataset_key: {canonical_field: source_header}} — exact header names
    # the legacy product uses, applied on top of synonym auto-detection.
    header_overrides: dict[str, dict[str, str]] = {}

    def build_mapping(self, dataset: DatasetSpec, headers: list[str]) -> dict[str, str]:
        overrides = self.header_overrides.get(dataset.key, {})
        return auto_map_headers(dataset, headers, overrides=overrides)


class WorkbenchAdapter(SourceAdapter):
    """Manual in-webapp data entry. Headers are the canonical field keys, so
    the mapping is the identity — no synonym guessing is needed."""

    source_type = MigrationSourceType.WORKBENCH
    label = "Web Workbench (manual entry)"

    def build_mapping(self, dataset: DatasetSpec, headers: list[str]) -> dict[str, str]:
        return {spec.key: spec.key for spec in dataset.fields}


class MyBillBookAdapter(SourceAdapter):
    source_type = MigrationSourceType.MYBILLBOOK
    label = "myBillBook"
    header_overrides = {
        "customers": {
            "full_name": "Party Name",
            "mobile": "Mobile Number",
            "opening_balance": "Opening Balance",
            "opening_balance_type": "To Collect / To Pay",
            "gst": "GSTIN",
            "address": "Billing Address",
        },
        "products": {
            "product_name": "Item Name",
            "sku": "Item Code",
            "selling_price": "Sales Price",
            "purchase_price": "Purchase Price",
            "gst": "GST Tax Rate(%)",
            "hsn": "HSN Code",
            "unit": "Measuring Unit",
        },
        "opening_stock": {
            "product": "Item Name",
            "quantity": "Current Stock",
            "cost": "Purchase Price",
        },
        "customer_outstanding": {
            "customer": "Party Name",
            "mobile": "Mobile Number",
            "outstanding": "Balance",
        },
        "vendors": {
            "vendor_name": "Party Name",
            "phone": "Mobile Number",
            "gst": "GSTIN",
            "opening_balance": "Opening Balance",
        },
    }


class ExcelAdapter(SourceAdapter):
    source_type = MigrationSourceType.EXCEL
    label = "Excel"


class TallyAdapter(SourceAdapter):
    source_type = MigrationSourceType.TALLY
    label = "Tally"


class BusyAdapter(SourceAdapter):
    source_type = MigrationSourceType.BUSY
    label = "Busy"


class MargAdapter(SourceAdapter):
    source_type = MigrationSourceType.MARG
    label = "Marg ERP"


class VyaparAdapter(SourceAdapter):
    source_type = MigrationSourceType.VYAPAR
    label = "Vyapar"


class ZohoBooksAdapter(SourceAdapter):
    source_type = MigrationSourceType.ZOHO_BOOKS
    label = "Zoho Books"


class MssqlAdapter(SourceAdapter):
    source_type = MigrationSourceType.MSSQL
    label = "Microsoft SQL Server (exported file)"


class CustomAdapter(SourceAdapter):
    source_type = MigrationSourceType.CUSTOM
    label = "Custom ERP"


ADAPTERS: dict[str, SourceAdapter] = {
    adapter.source_type: adapter()
    for adapter in (
        WorkbenchAdapter, MyBillBookAdapter, SourceAdapter, ExcelAdapter, TallyAdapter,
        BusyAdapter, MargAdapter, VyaparAdapter, ZohoBooksAdapter, MssqlAdapter, CustomAdapter,
    )
}


def get_adapter(source_type: str) -> SourceAdapter:
    return ADAPTERS.get(source_type) or ADAPTERS[MigrationSourceType.GENERIC_CSV]
