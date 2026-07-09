"""Enterprise Migration Center — pipeline, import, rollback, and API tests."""

import io

from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounting.models import (
    ChartOfAccount, ChartOfAccountType, CustomerOpeningOutstanding,
    FinanceAccount, FinanceAccountKind, Vendor, VendorLedgerEntry,
)
from migration_center.models import (
    DuplicateResolution, MigrationBatch, MigrationBatchStatus,
    MigrationStagingRow, StagingRowStatus,
)
from migration_center.services import (
    import_service, pipeline_service, reconciliation_service, rollback_service,
)
from subscriptions.models import Customer, Product
from tests.helpers import create_admin_user, create_user
from accounts.models import UserRole


def _upload_csv(text: str, *, dataset_key: str, source_type: str = "GENERIC_CSV", actor=None) -> MigrationBatch:
    return pipeline_service.create_batch_from_upload(
        uploaded_file=io.BytesIO(text.encode("utf-8")),
        filename="upload.csv",
        dataset_key=dataset_key,
        source_type=source_type,
        actor=actor,
    )


class CustomerImportPipelineTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="mig_admin", phone="9111111111")

    def _run_pipeline(self, batch):
        pipeline_service.validate_batch(batch=batch, actor=self.admin)
        pipeline_service.detect_duplicates(batch=batch, actor=self.admin)
        pipeline_service.build_preview(batch=batch, actor=self.admin)
        import_service.approve_batch(batch=batch, actor=self.admin)
        return import_service.execute_import(batch=batch, actor=self.admin)

    def test_csv_upload_creates_staging_rows_only(self):
        csv_text = "Customer Name,Phone,Balance\nRam Kumar,9876543210,1500\nShyam Das,9876543211,0\n"
        batch = _upload_csv(csv_text, dataset_key="customers", actor=self.admin)
        self.assertEqual(batch.total_rows, 2)
        self.assertEqual(batch.rows.count(), 2)
        self.assertEqual(Customer.objects.count(), 0)  # staging never touches production
        # Smart mapping: "Customer Name" -> full_name, "Phone" -> mobile, "Balance" -> opening_balance
        self.assertEqual(batch.mapping.get("full_name"), "Customer Name")
        self.assertEqual(batch.mapping.get("mobile"), "Phone")
        self.assertEqual(batch.mapping.get("opening_balance"), "Balance")
        self.assertEqual(len(batch.file_checksum_sha256), 64)

    def test_validation_flags_bad_rows_without_importing(self):
        csv_text = (
            "Full Name,Mobile,GST,PIN\n"
            "Good Customer,9876543210,,713301\n"
            ",9876543211,,713301\n"          # missing name
            "Bad Phone,12345,,713301\n"       # invalid mobile
            "Bad Pin,9876543212,,99\n"        # invalid PIN
        )
        batch = _upload_csv(csv_text, dataset_key="customers", actor=self.admin)
        counts = pipeline_service.validate_batch(batch=batch, actor=self.admin)
        self.assertEqual(counts["valid"], 1)
        self.assertEqual(counts["error"], 3)
        self.assertEqual(Customer.objects.count(), 0)

    def test_import_creates_customers_and_opening_receivables(self):
        csv_text = "Full Name,Mobile,Opening Balance,Opening Balance Type\nRam Kumar,9876543210,2500,To Collect\n"
        batch = _upload_csv(csv_text, dataset_key="customers", actor=self.admin)
        result = self._run_pipeline(batch)
        self.assertEqual(result["imported"], 1)
        customer = Customer.objects.get(phone="9876543210")
        self.assertEqual(customer.customer_source, "IMPORT")
        outstanding = CustomerOpeningOutstanding.objects.get(phone="9876543210")
        self.assertEqual(outstanding.outstanding_amount, Decimal("2500"))
        batch.refresh_from_db()
        self.assertEqual(batch.status, MigrationBatchStatus.IMPORTED)
        row = batch.rows.get()
        self.assertEqual(row.status, StagingRowStatus.IMPORTED)
        self.assertEqual(row.target_model, "subscriptions.Customer")

    def test_duplicate_detection_and_skip_resolution(self):
        create_user(username="existing_cust", role=UserRole.CUSTOMER, phone="9876543210")
        Customer.objects.create(
            user_id=create_user(username="c_dup", role=UserRole.CUSTOMER, phone="9999999999").pk,
            name="Existing", phone="9876543210",
        )
        csv_text = "Full Name,Mobile\nDuplicate Person,9876543210\nFresh Person,9812345678\n"
        batch = _upload_csv(csv_text, dataset_key="customers", actor=self.admin)
        pipeline_service.validate_batch(batch=batch, actor=self.admin)
        result = pipeline_service.detect_duplicates(batch=batch, actor=self.admin)
        self.assertEqual(result["duplicates"], 1)
        dup_row = batch.rows.get(status=StagingRowStatus.DUPLICATE)
        self.assertEqual(dup_row.duplicate_resolution, DuplicateResolution.SKIP)
        pipeline_service.build_preview(batch=batch, actor=self.admin)
        import_service.approve_batch(batch=batch, actor=self.admin)
        result = import_service.execute_import(batch=batch, actor=self.admin)
        self.assertEqual(result["imported"], 1)
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(Customer.objects.filter(phone="9812345678").count(), 1)
        self.assertEqual(Customer.objects.filter(phone="9876543210").count(), 1)  # not duplicated

    def test_rollback_deletes_only_migration_created_records(self):
        manual_user = create_user(username="manual_cust", role=UserRole.CUSTOMER, phone="9000000123")
        Customer.objects.create(user=manual_user, name="Manual Customer", phone="9000000123")
        csv_text = "Full Name,Mobile\nImported Person,9812345678\n"
        batch = _upload_csv(csv_text, dataset_key="customers", actor=self.admin)
        self._run_pipeline(batch)
        self.assertTrue(Customer.objects.filter(phone="9812345678").exists())
        result = rollback_service.rollback_batch(batch=batch, actor=self.admin)
        self.assertEqual(result["rolled_back"], 1)
        self.assertFalse(Customer.objects.filter(phone="9812345678").exists())
        self.assertTrue(Customer.objects.filter(phone="9000000123").exists())  # manual data untouched
        batch.refresh_from_db()
        self.assertEqual(batch.status, MigrationBatchStatus.ROLLED_BACK)

    def test_import_is_idempotent(self):
        csv_text = "Full Name,Mobile\nOnce Only,9812345678\n"
        batch = _upload_csv(csv_text, dataset_key="customers", actor=self.admin)
        self._run_pipeline(batch)
        # Re-executing must not duplicate: IMPORTED rows are excluded.
        import_service.execute_import(batch=batch, actor=self.admin)
        self.assertEqual(Customer.objects.filter(phone="9812345678").count(), 1)


class VendorAndOutstandingImportTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="mig_admin2", phone="9111111112")

    def _import(self, csv_text, dataset_key):
        batch = _upload_csv(csv_text, dataset_key=dataset_key, actor=self.admin)
        pipeline_service.validate_batch(batch=batch, actor=self.admin)
        pipeline_service.detect_duplicates(batch=batch, actor=self.admin)
        pipeline_service.build_preview(batch=batch, actor=self.admin)
        import_service.approve_batch(batch=batch, actor=self.admin)
        return batch, import_service.execute_import(batch=batch, actor=self.admin)

    def test_vendor_import_with_opening_payable(self):
        csv_text = "Vendor Name,Phone,Opening Balance\nAcme Traders,9876500000,7500\n"
        batch, result = self._import(csv_text, "vendors")
        self.assertEqual(result["imported"], 1)
        vendor = Vendor.objects.get(name="Acme Traders")
        entry = VendorLedgerEntry.objects.get(vendor=vendor, entry_type="OPENING_BALANCE")
        self.assertEqual(entry.credit, Decimal("7500"))
        self.assertEqual(entry.source_type, "MIGRATION_CENTER")

    def test_customer_outstanding_creates_opening_receivable_not_invoice(self):
        csv_text = "Customer,Outstanding,Invoice Number\nRam Kumar,3200,INV-991\n"
        batch, result = self._import(csv_text, "customer_outstanding")
        self.assertEqual(result["imported"], 1)
        outstanding = CustomerOpeningOutstanding.objects.get(customer_name="Ram Kumar")
        self.assertEqual(outstanding.outstanding_amount, Decimal("3200"))
        self.assertIn("INV-991", outstanding.notes)

    def test_vendor_outstanding_rollback(self):
        csv_text = "Vendor,Outstanding\nNew Supplier,4400\n"
        batch, result = self._import(csv_text, "vendor_outstanding")
        self.assertEqual(result["imported"], 1)
        self.assertTrue(Vendor.objects.filter(name="New Supplier").exists())
        rollback_service.rollback_batch(batch=batch, actor=self.admin)
        self.assertFalse(VendorLedgerEntry.objects.filter(source_type="MIGRATION_CENTER").exists())
        self.assertFalse(Vendor.objects.filter(name="New Supplier").exists())  # auto-created vendor removed


class FinanceOpeningBalanceImportTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="mig_admin3", phone="9111111113")
        chart = ChartOfAccount.objects.create(
            code="MIGCASH", name="Cash In Hand", account_type=ChartOfAccountType.ASSET,
            allow_manual_posting=True, is_active=True,
        )
        self.account = FinanceAccount.objects.create(
            name="Main Cash Drawer", kind=FinanceAccountKind.CASH, chart_account=chart,
            opening_balance=Decimal("100.00"),
        )

    def test_cash_opening_balance_update_and_rollback(self):
        csv_text = "Account,Opening Balance\nMain Cash Drawer,25000\n"
        batch = _upload_csv(csv_text, dataset_key="cash_opening_balance", actor=self.admin)
        pipeline_service.validate_batch(batch=batch, actor=self.admin)
        pipeline_service.build_preview(batch=batch, actor=self.admin)
        import_service.approve_batch(batch=batch, actor=self.admin)
        result = import_service.execute_import(batch=batch, actor=self.admin)
        self.assertEqual(result["imported"], 1)
        self.account.refresh_from_db()
        self.assertEqual(self.account.opening_balance, Decimal("25000"))
        # No payment vouchers are created — only the opening balance field changes.
        rollback_service.rollback_batch(batch=batch, actor=self.admin)
        self.account.refresh_from_db()
        self.assertEqual(self.account.opening_balance, Decimal("100.00"))  # prior value restored

    def test_unknown_account_is_a_validation_error(self):
        csv_text = "Account,Opening Balance\nGhost Wallet,999\n"
        batch = _upload_csv(csv_text, dataset_key="upi_opening_balance", actor=self.admin)
        counts = pipeline_service.validate_batch(batch=batch, actor=self.admin)
        self.assertEqual(counts["error"], 1)

    def test_reconciliation_difference_detection(self):
        csv_text = "Account,Opening Balance\nMain Cash Drawer,25000\n"
        batch = _upload_csv(csv_text, dataset_key="cash_opening_balance", actor=self.admin)
        pipeline_service.validate_batch(batch=batch, actor=self.admin)
        pipeline_service.build_preview(batch=batch, actor=self.admin)
        import_service.approve_batch(batch=batch, actor=self.admin)
        import_service.execute_import(batch=batch, actor=self.admin)
        reconciliation_service.set_expected_total(batch=batch, expected_total="30000", actor=self.admin)
        snapshot = reconciliation_service.reconcile_batch(batch=batch, actor=self.admin)
        self.assertEqual(snapshot["difference"], "5000")
        self.assertFalse(snapshot["matched"])
        overall = reconciliation_service.overall_reconciliation()
        self.assertFalse(overall["all_resolved"])


class ProductImportTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="mig_admin4", phone="9111111114")

    def test_product_import_base_price_is_contract_price(self):
        csv_text = "Item Name,Item Code,Sales Price,HSN Code,GST Tax Rate(%)\nSofa Set,SOFA-01,45000,9401,18\n"
        batch = _upload_csv(csv_text, dataset_key="products", source_type="MYBILLBOOK", actor=self.admin)
        # myBillBook adapter maps its export headers automatically.
        self.assertEqual(batch.mapping.get("product_name"), "Item Name")
        self.assertEqual(batch.mapping.get("selling_price"), "Sales Price")
        pipeline_service.validate_batch(batch=batch, actor=self.admin)
        pipeline_service.detect_duplicates(batch=batch, actor=self.admin)
        pipeline_service.build_preview(batch=batch, actor=self.admin)
        import_service.approve_batch(batch=batch, actor=self.admin)
        result = import_service.execute_import(batch=batch, actor=self.admin)
        self.assertEqual(result["imported"], 1)
        product = Product.objects.get(sku="SOFA-01")
        self.assertEqual(product.base_price, Decimal("45000"))
        self.assertEqual(product.hsn_sac_code, "9401")


class MigrationApiPermissionTests(TestCase):
    def setUp(self):
        self.client_api = APIClient()
        self.admin = create_admin_user(username="mig_api_admin", phone="9111111115")
        self.customer_user = create_user(username="mig_api_cust", role=UserRole.CUSTOMER, phone="9111111116")

    def test_admin_only_access(self):
        response = self.client_api.get("/api/v1/admin/migration/overview/")
        self.assertIn(response.status_code, (401, 403))
        self.client_api.force_authenticate(self.customer_user)
        response = self.client_api.get("/api/v1/admin/migration/overview/")
        self.assertEqual(response.status_code, 403)
        self.client_api.force_authenticate(self.admin)
        response = self.client_api.get("/api/v1/admin/migration/overview/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(any(d["key"] == "customers" for d in response.data["datasets"]))

    def test_upload_validate_execute_flow_via_api(self):
        self.client_api.force_authenticate(self.admin)
        csv_bytes = io.BytesIO(b"Full Name,Mobile\nApi Person,9812340001\n")
        csv_bytes.name = "customers.csv"
        response = self.client_api.post(
            "/api/v1/admin/migration/upload/",
            {"file": csv_bytes, "dataset_key": "customers", "source_type": "GENERIC_CSV"},
            format="multipart",
        )
        self.assertEqual(response.status_code, 201, response.data)
        batch_id = response.data["id"]
        self.assertEqual(self.client_api.post(f"/api/v1/admin/migration/batches/{batch_id}/validate/").status_code, 200)
        self.assertEqual(self.client_api.post(f"/api/v1/admin/migration/batches/{batch_id}/duplicates/").status_code, 200)
        self.assertEqual(self.client_api.post(f"/api/v1/admin/migration/batches/{batch_id}/preview/").status_code, 200)
        # Execute requires typed confirmation.
        response = self.client_api.post(f"/api/v1/admin/migration/batches/{batch_id}/execute/", {"confirmation": ""})
        self.assertEqual(response.status_code, 400)
        response = self.client_api.post(f"/api/v1/admin/migration/batches/{batch_id}/execute/", {"confirmation": "IMPORT"})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(Customer.objects.filter(phone="9812340001").exists())
        # Rollback also requires typed confirmation.
        response = self.client_api.post(f"/api/v1/admin/migration/batches/{batch_id}/rollback/", {"confirmation": "ROLLBACK"})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(Customer.objects.filter(phone="9812340001").exists())

    def test_template_download(self):
        self.client_api.force_authenticate(self.admin)
        response = self.client_api.get("/api/v1/admin/migration/templates/customers/?file_format=csv")
        self.assertEqual(response.status_code, 200)
        self.assertIn("Full Name", response.content.decode("utf-8-sig"))
        response = self.client_api.get("/api/v1/admin/migration/templates/customers/?file_format=xlsx")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content[:2], b"PK")

    def test_readiness_endpoint(self):
        self.client_api.force_authenticate(self.admin)
        response = self.client_api.get("/api/v1/admin/migration/readiness/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("ready_for_go_live", response.data)
        keys = {item["key"] for item in response.data["items"]}
        self.assertIn("reconciliation_passed", keys)


class XlsxImportTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="mig_admin5", phone="9111111117")

    def test_xlsx_upload(self):
        from openpyxl import Workbook

        workbook = Workbook()
        sheet = workbook.active
        sheet.append(["Full Name", "Mobile"])
        sheet.append(["Excel Person", "9812340002"])
        stream = io.BytesIO()
        workbook.save(stream)
        stream.seek(0)
        batch = pipeline_service.create_batch_from_upload(
            uploaded_file=stream, filename="customers.xlsx",
            dataset_key="customers", source_type="EXCEL", actor=self.admin,
        )
        self.assertEqual(batch.total_rows, 1)
        self.assertEqual(batch.mapping.get("full_name"), "Full Name")
