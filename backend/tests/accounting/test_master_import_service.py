from django.test import TestCase

from accounting.models import ChartOfAccount, ChartOfAccountType, Vendor
from accounting.services.master_import_service import (
    post_chart_of_accounts_import,
    post_vendor_import,
    preview_chart_of_accounts_import,
    preview_vendor_import,
)
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
