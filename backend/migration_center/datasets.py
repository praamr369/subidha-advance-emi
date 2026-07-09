"""Dataset registry for the Migration Center.

Each dataset declares its canonical fields, header synonyms (for smart
mapping), and basic type/format rules. Import/rollback behaviour lives in
the service layer keyed by ``dataset_key`` — no source-specific logic here.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z][Z][0-9A-Z]$")
PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
PIN_RE = re.compile(r"^[1-9][0-9]{5}$")
MOBILE_RE = re.compile(r"^[0-9]{10}$")


@dataclass(frozen=True)
class FieldSpec:
    key: str
    label: str
    required: bool = False
    kind: str = "text"  # text | decimal | date | mobile | email | gstin | pan | pin | choice | int
    synonyms: tuple[str, ...] = ()
    choices: tuple[str, ...] = ()
    max_length: int | None = None


@dataclass(frozen=True)
class DatasetSpec:
    key: str
    label: str
    fields: tuple[FieldSpec, ...]
    importable: bool = True
    amount_field: str | None = None  # field summed for reconciliation
    duplicate_keys: tuple[str, ...] = ()  # fields checked for duplicates
    description: str = ""

    @property
    def field_map(self) -> dict[str, FieldSpec]:
        return {f.key: f for f in self.fields}


def _norm_header(header: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (header or "").strip().lower())


CUSTOMERS = DatasetSpec(
    key="customers",
    label="Customer Master",
    amount_field="opening_balance",
    duplicate_keys=("mobile", "email", "gst"),
    description="Customer master with optional opening balance context.",
    fields=(
        FieldSpec("customer_code", "Customer Code", synonyms=("code", "custcode", "customerid", "partycode")),
        FieldSpec("full_name", "Full Name", required=True, synonyms=("name", "customername", "customerfullname", "partyname", "clientname")),
        FieldSpec("mobile", "Mobile", required=True, kind="mobile", synonyms=("phone", "phoneno", "mobileno", "contact", "contactno", "mobilenumber", "phonenumber")),
        FieldSpec("alternate_mobile", "Alternate Mobile", kind="mobile", synonyms=("altphone", "alternatephone", "phone2", "mobile2", "altmobile")),
        FieldSpec("email", "Email", kind="email", synonyms=("emailid", "emailaddress", "mail")),
        FieldSpec("address", "Address", synonyms=("billingaddress", "address1", "fulladdress", "addressline")),
        FieldSpec("city", "City", synonyms=("town",)),
        FieldSpec("district", "District", synonyms=("dist",)),
        FieldSpec("state", "State", synonyms=("statename",)),
        FieldSpec("pin", "PIN", kind="pin", synonyms=("pincode", "postalcode", "zip", "zipcode")),
        FieldSpec("gst", "GST", kind="gstin", synonyms=("gstin", "gstno", "gstnumber", "taxid")),
        FieldSpec("pan", "PAN", kind="pan", synonyms=("panno", "pannumber", "pancard")),
        FieldSpec("aadhaar", "Aadhaar", synonyms=("aadhar", "aadhaarno", "aadharno", "uid")),
        FieldSpec("credit_limit", "Credit Limit", kind="decimal", synonyms=("creditlimit", "creditlimitamount")),
        FieldSpec("opening_balance", "Opening Balance", kind="decimal", synonyms=("balance", "openingbalance", "openingbal", "obamount", "outstanding")),
        FieldSpec("opening_balance_type", "Opening Balance Type", kind="choice", choices=("DR", "CR"), synonyms=("balancetype", "obtype", "drcr", "openingbalancetype")),
        FieldSpec("status", "Status", kind="choice", choices=("ACTIVE", "INACTIVE"), synonyms=("customerstatus", "active")),
        FieldSpec("tags", "Tags", synonyms=("labels", "groups", "categorytags")),
        FieldSpec("notes", "Notes", synonyms=("remarks", "comment", "comments", "description")),
    ),
)

VENDORS = DatasetSpec(
    key="vendors",
    label="Vendor Master",
    amount_field="opening_balance",
    duplicate_keys=("gst", "phone"),
    description="Vendor / supplier master with opening payable context.",
    fields=(
        FieldSpec("vendor_code", "Vendor Code", synonyms=("code", "suppliercode", "vendorid")),
        FieldSpec("vendor_name", "Vendor Name", required=True, synonyms=("name", "suppliername", "partyname", "company", "companyname")),
        FieldSpec("gst", "GST", kind="gstin", synonyms=("gstin", "gstno", "gstnumber")),
        FieldSpec("phone", "Phone", kind="mobile", synonyms=("mobile", "phoneno", "contact", "contactno", "mobileno")),
        FieldSpec("email", "Email", kind="email", synonyms=("emailid", "emailaddress")),
        FieldSpec("address", "Address", synonyms=("fulladdress", "address1")),
        FieldSpec("outstanding", "Outstanding", kind="decimal", synonyms=("outstandingamount", "dueamount", "payable")),
        FieldSpec("opening_balance", "Opening Balance", kind="decimal", synonyms=("balance", "openingbalance", "openingbal")),
        FieldSpec("status", "Status", kind="choice", choices=("ACTIVE", "INACTIVE"), synonyms=("vendorstatus", "active")),
    ),
)

PRODUCTS = DatasetSpec(
    key="products",
    label="Product Master",
    duplicate_keys=("sku", "barcode"),
    description="Product master. Base price is the total contract price.",
    fields=(
        FieldSpec("sku", "SKU", synonyms=("itemcode", "productcode", "skucode", "code")),
        FieldSpec("barcode", "Barcode", synonyms=("ean", "barcodeno", "upc")),
        FieldSpec("product_name", "Product Name", required=True, synonyms=("name", "itemname", "item", "productname", "title")),
        FieldSpec("category", "Category", synonyms=("productcategory", "itemcategory", "group", "itemgroup")),
        FieldSpec("subcategory", "Subcategory", synonyms=("subcat", "productsubcategory", "subgroup")),
        FieldSpec("brand", "Brand", synonyms=("brandname", "make", "manufacturer")),
        FieldSpec("unit", "Unit", synonyms=("uom", "unitofmeasure", "units", "measurementunit")),
        FieldSpec("hsn", "HSN", synonyms=("hsncode", "hsnsac", "saccode", "hsnsaccode")),
        FieldSpec("gst", "GST", kind="decimal", synonyms=("gstrate", "gstpercent", "taxrate", "taxpercent")),
        FieldSpec("purchase_price", "Purchase Price", kind="decimal", synonyms=("costprice", "buyprice", "purchaserate", "cost")),
        FieldSpec("selling_price", "Selling Price", kind="decimal", synonyms=("saleprice", "sellprice", "rate", "salerate", "price", "baseprice")),
        FieldSpec("mrp", "MRP", kind="decimal", synonyms=("mrpprice", "maximumretailprice", "listprice")),
        FieldSpec("status", "Status", kind="choice", choices=("ACTIVE", "INACTIVE"), synonyms=("productstatus", "active")),
    ),
)

OPENING_STOCK = DatasetSpec(
    key="opening_stock",
    label="Opening Stock",
    amount_field="cost",
    duplicate_keys=(),
    description="Opening stock ledger entries only — never fake purchases.",
    fields=(
        FieldSpec("warehouse", "Warehouse", synonyms=("location", "store", "godown", "stocklocation", "branch")),
        FieldSpec("product", "Product", required=True, synonyms=("item", "itemname", "productname", "sku", "itemcode", "productcode")),
        FieldSpec("quantity", "Quantity", required=True, kind="decimal", synonyms=("qty", "stockqty", "openingqty", "openingstock", "currentstock")),
        FieldSpec("cost", "Cost", kind="decimal", synonyms=("unitcost", "costprice", "rate", "purchaseprice")),
        FieldSpec("serial", "Serial", synonyms=("serialno", "serialnumber", "srno")),
        FieldSpec("batch", "Batch", synonyms=("batchno", "batchnumber", "lot", "lotno")),
        FieldSpec("opening_date", "Opening Date", kind="date", synonyms=("date", "asofdate", "effectivedate", "stockdate")),
        FieldSpec("remarks", "Remarks", synonyms=("notes", "comment", "description")),
    ),
)

CUSTOMER_OUTSTANDING = DatasetSpec(
    key="customer_outstanding",
    label="Customer Outstanding",
    amount_field="outstanding",
    duplicate_keys=(),
    description="Opening receivable entries — historical invoices are not recreated.",
    fields=(
        FieldSpec("customer", "Customer", required=True, synonyms=("customername", "name", "partyname", "party", "client")),
        FieldSpec("mobile", "Mobile", kind="mobile", synonyms=("phone", "phoneno", "contact", "mobileno")),
        FieldSpec("reference", "Reference", synonyms=("ref", "referenceno", "refno")),
        FieldSpec("invoice_number", "Invoice Number", synonyms=("invoiceno", "billno", "billnumber", "invno")),
        FieldSpec("invoice_date", "Invoice Date", kind="date", synonyms=("billdate", "date", "invdate")),
        FieldSpec("outstanding", "Outstanding", required=True, kind="decimal", synonyms=("outstandingamount", "balance", "dueamount", "amount", "pendingamount")),
        FieldSpec("due_date", "Due Date", kind="date", synonyms=("duedate", "paymentduedate")),
        FieldSpec("remarks", "Remarks", synonyms=("notes", "comment", "description")),
    ),
)

VENDOR_OUTSTANDING = DatasetSpec(
    key="vendor_outstanding",
    label="Vendor Outstanding",
    amount_field="outstanding",
    duplicate_keys=(),
    description="Opening payable entries in the vendor ledger.",
    fields=(
        FieldSpec("vendor", "Vendor", required=True, synonyms=("vendorname", "suppliername", "name", "partyname", "party")),
        FieldSpec("reference", "Reference", synonyms=("ref", "referenceno", "billno", "invoiceno")),
        FieldSpec("bill_date", "Bill Date", kind="date", synonyms=("invoicedate", "date")),
        FieldSpec("outstanding", "Outstanding", required=True, kind="decimal", synonyms=("outstandingamount", "balance", "dueamount", "amount", "payable")),
        FieldSpec("due_date", "Due Date", kind="date", synonyms=("duedate",)),
        FieldSpec("remarks", "Remarks", synonyms=("notes", "comment")),
    ),
)

_OPENING_BALANCE_FIELDS = (
    FieldSpec("account", "Account", required=True, synonyms=("accountname", "name", "financeaccount", "ledger", "ledgername", "wallet", "bankname", "upihandle")),
    FieldSpec("type", "Type", kind="choice", choices=("CASH", "BANK", "UPI"), synonyms=("accounttype", "kind")),
    FieldSpec("opening_balance", "Opening Balance", required=True, kind="decimal", synonyms=("balance", "openingbal", "amount", "openingamount")),
    FieldSpec("effective_date", "Effective Date", kind="date", synonyms=("date", "asofdate", "openingdate")),
    FieldSpec("reference", "Reference", synonyms=("ref", "referenceno")),
    FieldSpec("remarks", "Remarks", synonyms=("notes", "comment", "description")),
)

CASH_OPENING = DatasetSpec(
    key="cash_opening_balance", label="Cash Opening Balance", amount_field="opening_balance",
    fields=_OPENING_BALANCE_FIELDS, description="Opening balances for cash drawers/counters. No vouchers created.",
)
BANK_OPENING = DatasetSpec(
    key="bank_opening_balance", label="Bank Opening Balance", amount_field="opening_balance",
    fields=_OPENING_BALANCE_FIELDS, description="Opening balances for bank accounts. No vouchers created.",
)
UPI_OPENING = DatasetSpec(
    key="upi_opening_balance", label="UPI Opening Balance", amount_field="opening_balance",
    fields=_OPENING_BALANCE_FIELDS, description="Opening balances for UPI wallets (PhonePe, Google Pay, Paytm, BHIM…). No vouchers created.",
)

# Template-only datasets (downloadable templates; import via existing master screens).
CATEGORY_MASTER = DatasetSpec(
    key="category_master", label="Category Master", importable=False,
    fields=(FieldSpec("name", "Category Name", required=True, synonyms=("category", "categoryname")),
            FieldSpec("parent", "Parent Category", synonyms=("parentcategory",)),
            FieldSpec("description", "Description", synonyms=("notes",))),
)
BRAND_MASTER = DatasetSpec(
    key="brand_master", label="Brand Master", importable=False,
    fields=(FieldSpec("name", "Brand Name", required=True, synonyms=("brand", "brandname")),
            FieldSpec("description", "Description", synonyms=("notes",))),
)
UNIT_MASTER = DatasetSpec(
    key="unit_master", label="Unit Master", importable=False,
    fields=(FieldSpec("name", "Unit Name", required=True, synonyms=("unit", "uom")),
            FieldSpec("symbol", "Symbol", synonyms=("shortname", "abbreviation")),
            FieldSpec("decimal_places", "Decimal Places", kind="int", synonyms=("decimals",))),
)
WAREHOUSE = DatasetSpec(
    key="warehouse", label="Warehouse", importable=False,
    fields=(FieldSpec("name", "Warehouse Name", required=True, synonyms=("warehouse", "location", "godown")),
            FieldSpec("address", "Address"),
            FieldSpec("branch", "Branch", synonyms=("branchname",))),
)
CHART_OF_ACCOUNTS = DatasetSpec(
    key="chart_of_accounts", label="Chart of Accounts (optional)", importable=False,
    fields=(FieldSpec("code", "Code", required=True, synonyms=("accountcode",)),
            FieldSpec("name", "Name", required=True, synonyms=("accountname",)),
            FieldSpec("account_type", "Account Type", required=True, kind="choice",
                      choices=("ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"), synonyms=("type",)),
            FieldSpec("parent_code", "Parent Code", synonyms=("parent",))),
)
EMPLOYEE_IMPORT = DatasetSpec(
    key="employee_import", label="Employee Import", importable=False,
    fields=(FieldSpec("name", "Full Name", required=True, synonyms=("employeename", "staffname")),
            FieldSpec("mobile", "Mobile", required=True, kind="mobile", synonyms=("phone", "contact")),
            FieldSpec("email", "Email", kind="email"),
            FieldSpec("role", "Role", synonyms=("designation",)),
            FieldSpec("joining_date", "Joining Date", kind="date", synonyms=("doj",)),
            FieldSpec("salary", "Salary", kind="decimal", synonyms=("monthlysalary",))),
)
PARTNER_IMPORT = DatasetSpec(
    key="partner_import", label="Partner Import", importable=False,
    fields=(FieldSpec("name", "Full Name", required=True, synonyms=("partnername",)),
            FieldSpec("mobile", "Mobile", required=True, kind="mobile", synonyms=("phone", "contact")),
            FieldSpec("email", "Email", kind="email"),
            FieldSpec("area", "Area", synonyms=("territory", "zone"))),
)

DATASETS: dict[str, DatasetSpec] = {
    spec.key: spec
    for spec in (
        CUSTOMERS, VENDORS, PRODUCTS, OPENING_STOCK,
        CUSTOMER_OUTSTANDING, VENDOR_OUTSTANDING,
        CASH_OPENING, BANK_OPENING, UPI_OPENING,
        CATEGORY_MASTER, BRAND_MASTER, UNIT_MASTER, WAREHOUSE,
        CHART_OF_ACCOUNTS, EMPLOYEE_IMPORT, PARTNER_IMPORT,
    )
}


def get_dataset(key: str) -> DatasetSpec:
    spec = DATASETS.get(key)
    if spec is None:
        raise ValueError(f"Unknown dataset: {key}")
    return spec


def auto_map_headers(dataset: DatasetSpec, headers: list[str], overrides: dict[str, str] | None = None) -> dict[str, str]:
    """Return {canonical_field_key: source_header} using synonym matching.

    ``overrides`` (adapter-provided) win over generic synonym detection.
    """
    normalized = {_norm_header(h): h for h in headers if (h or "").strip()}
    mapping: dict[str, str] = {}
    for spec in dataset.fields:
        candidates = [spec.key, spec.label, *spec.synonyms]
        for candidate in candidates:
            hit = normalized.get(_norm_header(candidate))
            if hit is not None and hit not in mapping.values():
                mapping[spec.key] = hit
                break
    for field_key, header in (overrides or {}).items():
        if field_key in dataset.field_map and header in headers:
            mapping[field_key] = header
    return mapping
