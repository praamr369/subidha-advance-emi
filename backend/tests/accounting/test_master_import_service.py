from datetime import date
from decimal import Decimal

from django.test import TestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, EmployeeProfile, Vendor
from accounting.services.master_import_service import (
    post_chart_of_accounts_import,
    post_employee_import,
    post_vendor_import,
    preview_chart_of_accounts_import,
    preview_employee_import,
    preview_vendor_import,
)
from branch_control.models import Branch
from crm.models import PartyLink, PartyLinkRole
from tests.helpers import create_admin_user


class AccountingMasterImportServiceTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="acct_import_admin",
            phone="9387000010",
        )

    def test_chart_of_accounts_import_preview_and_post(self):
        ChartOfAccount.objects.create(
            code="AST-001",
            name="Cash On Hand",
            account_type=ChartOfAccountType.ASSET,
        )
        csv_text = (
            "code,name,account_type,parent_code,is_active,allow_manual_posting,system_code\n"
            "AST-001,Main Cash,ASSET,,true,true,\n"
            "INC-001,Sales Revenue,INCOME,,true,false,\n"
        )

        preview = preview_chart_of_accounts_import(csv_text)
        self.assertEqual(preview["valid_count"], 2)
        self.assertEqual(preview["invalid_count"], 0)

        result = post_chart_of_accounts_import(csv_text, performed_by=self.admin)
        self.assertEqual(result["created"], 1)
        self.assertEqual(result["updated"], 1)
        self.assertEqual(ChartOfAccount.objects.get(code="AST-001").name, "Main Cash")
        self.assertEqual(ChartOfAccount.objects.get(code="INC-001").account_type, ChartOfAccountType.INCOME)

    def test_vendor_import_preview_and_post(self):
        Vendor.objects.create(
            name="Vendor Existing",
            gstin="GSTEXIST001",
            phone="9000000001",
            email="existing@example.com",
        )
        csv_text = (
            "name,phone,email,address,gstin,state_code,state_name,is_active\n"
            "Vendor Existing,9000000001,existing@example.com,Updated Address,GSTEXIST001,WB,West Bengal,true\n"
            "Vendor Fresh,9000000002,fresh@example.com,New Address,,WB,West Bengal,true\n"
        )

        preview = preview_vendor_import(csv_text)
        self.assertEqual(preview["valid_count"], 2)
        self.assertEqual(preview["invalid_count"], 0)

        result = post_vendor_import(csv_text, performed_by=self.admin)
        self.assertEqual(result["created"], 1)
        self.assertEqual(result["updated"], 1)
        self.assertEqual(Vendor.objects.get(gstin="GSTEXIST001").address, "Updated Address")
        self.assertTrue(Vendor.objects.filter(name="Vendor Fresh").exists())

    def test_employee_import_preview_and_post_syncs_party_and_branch(self):
        branch = Branch.objects.filter(is_primary=True).get()
        branch.code = "BR-EMP"
        branch.name = "Employee Branch"
        branch.save(update_fields=["code", "name", "updated_at"])
        existing = EmployeeProfile.objects.create(
            employee_code="EMP-EXIST",
            name="Existing Employee",
            phone="9000000101",
            branch=branch,
            joining_date=date(2026, 1, 1),
            base_salary=Decimal("12000.00"),
            standard_daily_hours=Decimal("8.00"),
            overtime_rate_per_hour=Decimal("125.00"),
        )

        csv_text = (
            "employee_code,name,phone,branch_code,designation,department,joining_date,base_salary,standard_daily_hours,overtime_rate_per_hour,is_active,notes\n"
            "EMP-EXIST,Existing Employee Updated,9000000101,BR-EMP,Supervisor,Sales,2026-01-01,13000.00,8.50,150.00,true,Updated row\n"
            "EMP-NEW,Fresh Employee,9000000102,BR-EMP,Executive,Operations,2026-02-10,11000.00,8.00,100.00,true,New row\n"
        )

        preview = preview_employee_import(csv_text)
        self.assertEqual(preview["valid_count"], 2)
        self.assertEqual(preview["invalid_count"], 0)

        result = post_employee_import(csv_text, performed_by=self.admin)
        self.assertEqual(result["created"], 1)
        self.assertEqual(result["updated"], 1)

        existing.refresh_from_db()
        self.assertEqual(existing.name, "Existing Employee Updated")
        self.assertEqual(existing.base_salary, Decimal("13000.00"))
        self.assertEqual(existing.standard_daily_hours, Decimal("8.50"))
        self.assertEqual(existing.overtime_rate_per_hour, Decimal("150.00"))

        created = EmployeeProfile.objects.get(phone="9000000102")
        self.assertEqual(created.employee_code, "EMP-NEW")
        self.assertEqual(created.branch_id, branch.id)
        self.assertTrue(
            PartyLink.objects.filter(
                role_type=PartyLinkRole.STAFF,
                source_model="EmployeeProfile",
                source_pk=created.id,
            ).exists()
        )
