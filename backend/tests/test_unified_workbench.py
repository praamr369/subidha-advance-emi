"""
Unified Workbench Tests - Backend
Tests for 100% faster workflow
"""

from django.test import TestCase, TransactionTestCase, Client
from subscriptions.models import Customer, Product, OnlineRequest, ProductRequest
from subscriptions.services.workbench_service import WorkbenchService
from accounts.models import User, UserRole
import json


class WorkbenchServiceTestCase(TransactionTestCase):
    """Test workbench service operations"""

    def setUp(self):
        """Setup test data"""
        # Create admin user
        self.admin = User.objects.create_user(
            username="admin",
            email="admin@test.com",
            password="testpass123",
            phone="9111111111"
        )

        # Create customer
        self.user = User.objects.create_user(
            username="customer",
            email="customer@test.com",
            password="testpass123",
            phone="9222222222"
        )
        self.customer = Customer.objects.create(
            user=self.user,
            name="Test Customer",
            phone="9876543210",
            city="Mumbai"
        )

        # Create product
        self.product = Product.objects.create(
            name="Test Product",
            product_code="TEST-001",
            base_price=50000,
            is_active=True
        )

    def test_get_customer_workbench_basic(self):
        """Test basic workbench retrieval"""
        workbench = WorkbenchService.get_customer_workbench(self.customer.id)

        # Verify structure
        self.assertIn("customer", workbench)
        self.assertIn("online_requests", workbench)
        self.assertIn("crm_lead", workbench)
        self.assertIn("product_requests", workbench)
        self.assertIn("invoices", workbench)
        self.assertIn("timeline", workbench)
        self.assertIn("next_actions", workbench)

        # Verify customer data
        self.assertEqual(workbench["customer"]["id"], self.customer.id)
        self.assertEqual(workbench["customer"]["name"], "Test Customer")
        self.assertEqual(workbench["customer"]["phone"], "9876543210")

    def test_online_request_in_workbench(self):
        """Test online request appears in workbench"""
        # Create online request
        online_req = OnlineRequest.objects.create(
            customer=self.customer,
            product=self.product,
            request_number="ORQ-2026-00001",
            request_type="DIRECT_SALE",
            quantity=1,
            unit_price=50000,
            status="QUOTE_SENT"
        )

        workbench = WorkbenchService.get_customer_workbench(self.customer.id)

        # Verify online request in workbench
        self.assertEqual(len(workbench["online_requests"]), 1)
        self.assertEqual(
            workbench["online_requests"][0]["request_number"],
            "ORQ-2026-00001"
        )
        self.assertEqual(workbench["online_requests"][0]["status"], "QUOTE_SENT")

    def test_product_request_in_workbench(self):
        """Test product request appears in workbench"""
        # Create product request
        prod_req = ProductRequest.objects.create(
            requester=self.admin,
            requester_role_snapshot="ADMIN",
            customer=self.customer,
            product=self.product,
            request_type="DIRECT_SALE",
            status="SUBMITTED"
        )

        workbench = WorkbenchService.get_customer_workbench(self.customer.id)

        # Verify product request in workbench
        self.assertEqual(len(workbench["product_requests"]), 1)
        self.assertEqual(workbench["product_requests"][0]["type"], "DIRECT_SALE")
        self.assertEqual(workbench["product_requests"][0]["status"], "SUBMITTED")

    def test_update_customer_profile(self):
        """Test atomic profile update"""
        service = WorkbenchService()

        result = service.update_customer_profile(
            self.customer.id,
            {
                "name": "Updated Name",
                "phone": "9999999999",
                "city": "Delhi"
            }
        )

        # Verify result
        self.assertEqual(result["status"], "success")
        self.assertIn("name", result["changed"])
        self.assertIn("phone", result["changed"])

        # Verify changes persisted
        customer = Customer.objects.get(id=self.customer.id)
        self.assertEqual(customer.name, "Updated Name")
        self.assertEqual(customer.phone, "9999999999")
        self.assertEqual(customer.city, "Delhi")

    def test_timeline_generation(self):
        """Test timeline includes all events"""
        # Create online request
        OnlineRequest.objects.create(
            customer=self.customer,
            product=self.product,
            request_number="ORQ-2026-00001",
            request_type="DIRECT_SALE",
            quantity=1,
            status="DRAFT"
        )

        # Create product request
        ProductRequest.objects.create(
            requester=self.admin,
            requester_role_snapshot="ADMIN",
            customer=self.customer,
            product=self.product,
            request_type="DIRECT_SALE",
            status="SUBMITTED"
        )

        workbench = WorkbenchService.get_customer_workbench(self.customer.id)

        # Verify timeline
        self.assertGreater(len(workbench["timeline"]), 0)
        timeline_events = [e["type"] for e in workbench["timeline"]]
        self.assertIn("enquiry", timeline_events)
        self.assertIn("request", timeline_events)

    def test_next_actions_determination(self):
        """Test next actions are determined correctly"""
        # Create pending online request
        OnlineRequest.objects.create(
            customer=self.customer,
            product=self.product,
            request_number="ORQ-2026-00001",
            request_type="DIRECT_SALE",
            quantity=1,
            status="DRAFT"
        )

        workbench = WorkbenchService.get_customer_workbench(self.customer.id)

        # Verify next actions
        self.assertGreater(len(workbench["next_actions"]), 0)
        self.assertIn("Send quote to customer", workbench["next_actions"])


class WorkbenchAPITestCase(TransactionTestCase):
    """Test workbench API endpoints"""

    def setUp(self):
        """Setup test data"""
        self.client = Client()

        # Create admin
        self.admin = User.objects.create_user(
            username="admin",
            email="admin@test.com",
            password="testpass123",
            phone="9111111111"
        )
        self.admin_role = UserRole.objects.create(
            user=self.admin,
            role_type="ADMIN"
        )

        # Create customer
        self.user = User.objects.create_user(
            username="customer",
            email="customer@test.com",
            password="testpass123",
            phone="9222222222"
        )
        self.customer = Customer.objects.create(
            user=self.user,
            name="Test Customer",
            phone="9876543210"
        )

        # Create product
        self.product = Product.objects.create(
            name="Test Product",
            product_code="TEST-001",
            base_price=50000,
            is_active=True
        )

        # Login
        self.client.login(username="admin", password="testpass123")

    def test_workbench_api_get(self):
        """Test GET workbench API"""
        response = self.client.get(
            f"/api/v1/admin/workbench/customer/{self.customer.id}/"
        )

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertIn("data", data)
        self.assertEqual(data["data"]["customer"]["id"], self.customer.id)

    def test_workbench_api_not_found(self):
        """Test API with invalid customer"""
        response = self.client.get("/api/v1/admin/workbench/customer/99999/")

        self.assertEqual(response.status_code, 404)

    def test_profile_update_api(self):
        """Test profile update API"""
        response = self.client.post(
            f"/api/v1/admin/workbench/customer/{self.customer.id}/profile/",
            data=json.dumps({
                "name": "Updated Name",
                "phone": "9999999999"
            }),
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 200)

        # Verify changes
        customer = Customer.objects.get(id=self.customer.id)
        self.assertEqual(customer.name, "Updated Name")
