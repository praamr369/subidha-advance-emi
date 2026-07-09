"""Data Workbench — online create/edit/delete/validate/import tests."""

import io

from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from migration_center.models import (
    MigrationBatch, MigrationBatchStatus, MigrationSourceType, StagingRowStatus,
)
from migration_center.services import import_service, pipeline_service, workbench_service
from subscriptions.models import Customer
from tests.helpers import create_admin_user, create_user
from accounts.models import UserRole


class WorkbenchServiceTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="wb_admin", phone="9222222221")

    def test_create_manual_batch_has_identity_mapping(self):
        batch = workbench_service.create_workbench_batch(dataset_key="customers", actor=self.admin)
        self.assertEqual(batch.source_type, MigrationSourceType.WORKBENCH)
        self.assertEqual(batch.mapping.get("full_name"), "full_name")
        self.assertEqual(batch.total_rows, 0)

    def test_add_edit_delete_rows_with_inline_validation(self):
        batch = workbench_service.create_workbench_batch(dataset_key="customers", actor=self.admin)
        good = workbench_service.add_row(batch=batch, data={"full_name": "Ram", "mobile": "9876543210"}, actor=self.admin)
        self.assertEqual(good.status, StagingRowStatus.VALID)
        bad = workbench_service.add_row(batch=batch, data={"full_name": "", "mobile": "123"}, actor=self.admin)
        self.assertEqual(bad.status, StagingRowStatus.ERROR)
        self.assertTrue(bad.errors)
        batch.refresh_from_db()
        self.assertEqual(batch.total_rows, 2)
        self.assertEqual(batch.valid_rows, 1)
        self.assertEqual(batch.error_rows, 1)
        # Fix the bad row via edit.
        fixed = workbench_service.update_row(batch=batch, row_number=bad.row_number, data={"full_name": "Shyam", "mobile": "9812345678"}, actor=self.admin)
        self.assertEqual(fixed.status, StagingRowStatus.VALID)
        # Delete a row.
        workbench_service.delete_row(batch=batch, row_number=good.row_number, actor=self.admin)
        batch.refresh_from_db()
        self.assertEqual(batch.total_rows, 1)

    def test_bulk_set_and_import(self):
        batch = workbench_service.create_workbench_batch(dataset_key="customers", actor=self.admin)
        workbench_service.bulk_set_rows(batch=batch, rows=[
            {"full_name": "Ram", "mobile": "9876543210"},
            {"full_name": "Shyam", "mobile": "9812345678"},
            {"full_name": "", "mobile": ""},  # blank rows dropped
        ], actor=self.admin)
        batch.refresh_from_db()
        self.assertEqual(batch.total_rows, 2)
        pipeline_service.detect_duplicates(batch=batch, actor=self.admin)
        pipeline_service.build_preview(batch=batch, actor=self.admin)
        import_service.approve_batch(batch=batch, actor=self.admin)
        result = import_service.execute_import(batch=batch, actor=self.admin)
        self.assertEqual(result["imported"], 2)
        self.assertEqual(Customer.objects.filter(phone__in=["9876543210", "9812345678"]).count(), 2)

    def test_cannot_edit_after_import(self):
        batch = workbench_service.create_workbench_batch(dataset_key="customers", actor=self.admin)
        workbench_service.add_row(batch=batch, data={"full_name": "Ram", "mobile": "9876543210"}, actor=self.admin)
        pipeline_service.detect_duplicates(batch=batch, actor=self.admin)
        pipeline_service.build_preview(batch=batch, actor=self.admin)
        import_service.approve_batch(batch=batch, actor=self.admin)
        import_service.execute_import(batch=batch, actor=self.admin)
        batch.refresh_from_db()
        with self.assertRaises(ValueError):
            workbench_service.add_row(batch=batch, data={"full_name": "X", "mobile": "9811111111"}, actor=self.admin)

    def test_adopt_uploaded_file_into_workbench(self):
        batch = pipeline_service.create_batch_from_upload(
            uploaded_file=io.BytesIO(b"Customer Name,Phone\nRam,9876543210\n"),
            filename="c.csv", dataset_key="customers", source_type="GENERIC_CSV", actor=self.admin,
        )
        pipeline_service.validate_batch(batch=batch, actor=self.admin)
        workbench_service.adopt_upload_for_editing(batch=batch, actor=self.admin)
        batch.refresh_from_db()
        # Rows are now keyed by canonical field so the grid can edit them.
        self.assertEqual(batch.mapping.get("full_name"), "full_name")
        row = batch.rows.get()
        self.assertEqual(row.raw_data.get("full_name"), "Ram")
        self.assertEqual(row.mapped_data.get("mobile"), "9876543210")


class WorkbenchApiTests(TestCase):
    def setUp(self):
        self.client_api = APIClient()
        self.admin = create_admin_user(username="wb_api_admin", phone="9222222223")
        self.customer_user = create_user(username="wb_api_cust", role=UserRole.CUSTOMER, phone="9222222224")

    def test_workbench_is_admin_only(self):
        self.client_api.force_authenticate(self.customer_user)
        response = self.client_api.post("/api/v1/admin/migration/workbench/", {"dataset_key": "customers"})
        self.assertEqual(response.status_code, 403)

    def test_full_workbench_flow_via_api(self):
        self.client_api.force_authenticate(self.admin)
        create = self.client_api.post("/api/v1/admin/migration/workbench/", {"dataset_key": "customers"}, format="json")
        self.assertEqual(create.status_code, 201, create.data)
        batch_id = create.data["id"]
        # Add a row.
        add = self.client_api.post(f"/api/v1/admin/migration/batches/{batch_id}/rows/", {"data": {"full_name": "Ram", "mobile": "9876543210"}}, format="json")
        self.assertEqual(add.status_code, 201, add.data)
        self.assertEqual(add.data["row"]["status"], "VALID")
        row_number = add.data["row"]["row_number"]
        # Edit it.
        patch = self.client_api.patch(f"/api/v1/admin/migration/batches/{batch_id}/rows/{row_number}/", {"data": {"full_name": "Ram Kumar", "mobile": "9876543210"}}, format="json")
        self.assertEqual(patch.status_code, 200, patch.data)
        # Add a second then delete it.
        add2 = self.client_api.post(f"/api/v1/admin/migration/batches/{batch_id}/rows/", {"data": {"full_name": "Temp", "mobile": "9812345678"}}, format="json")
        del_resp = self.client_api.delete(f"/api/v1/admin/migration/batches/{batch_id}/rows/{add2.data['row']['row_number']}/")
        self.assertEqual(del_resp.status_code, 200, del_resp.data)
        # Preview + execute.
        self.client_api.post(f"/api/v1/admin/migration/batches/{batch_id}/duplicates/")
        self.client_api.post(f"/api/v1/admin/migration/batches/{batch_id}/preview/")
        execute = self.client_api.post(f"/api/v1/admin/migration/batches/{batch_id}/execute/", {"confirmation": "IMPORT"}, format="json")
        self.assertEqual(execute.status_code, 200, execute.data)
        self.assertTrue(Customer.objects.filter(phone="9876543210").exists())

    def test_bulk_set_via_api(self):
        self.client_api.force_authenticate(self.admin)
        create = self.client_api.post("/api/v1/admin/migration/workbench/", {"dataset_key": "vendors"}, format="json")
        batch_id = create.data["id"]
        put = self.client_api.put(
            f"/api/v1/admin/migration/batches/{batch_id}/rows/",
            {"rows": [{"vendor_name": "Acme"}, {"vendor_name": "Globex"}]},
            format="json",
        )
        self.assertEqual(put.status_code, 200, put.data)
        self.assertEqual(put.data["saved"], 2)

    def test_delete_empty_batch(self):
        self.client_api.force_authenticate(self.admin)
        create = self.client_api.post("/api/v1/admin/migration/workbench/", {"dataset_key": "customers"}, format="json")
        batch_id = create.data["id"]
        resp = self.client_api.delete(f"/api/v1/admin/migration/batches/{batch_id}/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertFalse(MigrationBatch.objects.filter(pk=batch_id).exists())

    def test_cannot_delete_imported_batch(self):
        self.client_api.force_authenticate(self.admin)
        create = self.client_api.post("/api/v1/admin/migration/workbench/", {"dataset_key": "customers"}, format="json")
        batch_id = create.data["id"]
        self.client_api.post(f"/api/v1/admin/migration/batches/{batch_id}/rows/", {"data": {"full_name": "Ram", "mobile": "9876543210"}}, format="json")
        self.client_api.post(f"/api/v1/admin/migration/batches/{batch_id}/duplicates/")
        self.client_api.post(f"/api/v1/admin/migration/batches/{batch_id}/preview/")
        self.client_api.post(f"/api/v1/admin/migration/batches/{batch_id}/execute/", {"confirmation": "IMPORT"}, format="json")
        # Imported batch cannot be deleted until rolled back.
        resp = self.client_api.delete(f"/api/v1/admin/migration/batches/{batch_id}/")
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(MigrationBatch.objects.filter(pk=batch_id).exists())
        # After rollback, deletion is allowed.
        self.client_api.post(f"/api/v1/admin/migration/batches/{batch_id}/rollback/", {"confirmation": "ROLLBACK"}, format="json")
        resp = self.client_api.delete(f"/api/v1/admin/migration/batches/{batch_id}/")
        self.assertEqual(resp.status_code, 200, resp.data)
