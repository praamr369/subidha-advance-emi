from decimal import Decimal

from django.test import TestCase

from subscriptions.services.dashboard_scopes import (
    AdminScope,
    CashierScope,
    CustomerScope,
    DashboardScopeError,
    PartnerScope,
    resolve_dashboard_scope,
)
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_cashier_user,
    create_customer_profile,
    create_customer_user,
    create_lucky_id,
    create_partner_user,
    create_product,
    create_subscription,
)


class DashboardScopePermissionsTests(TestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="scope_permission_admin",
            phone="9320000001",
        )
        self.cashier = create_cashier_user(
            username="scope_permission_cashier",
            phone="9320000002",
        )
        self.partner = create_partner_user(
            username="scope_permission_partner",
            phone="9320000003",
        )
        self.other_partner = create_partner_user(
            username="scope_permission_partner_other",
            phone="9320000004",
        )
        self.customer_user = create_customer_user(
            username="scope_permission_customer",
            phone="7320000001",
        )
        self.customer = create_customer_profile(
            user=self.customer_user,
            name="Scope Permission Customer",
            phone="7320000001",
        )
        self.customer_without_profile = create_customer_user(
            username="scope_permission_orphan_customer",
            phone="7320000002",
        )

        product = create_product(
            name="Scope Product",
            product_code="SCOPE-001",
            base_price=Decimal("2400.00"),
        )
        batch = create_batch(batch_code="SCOPEGROUP2026", duration_months=2)
        lucky_id_one = create_lucky_id(batch=batch, lucky_number=10)
        lucky_id_two = create_lucky_id(batch=batch, lucky_number=11)

        self.partner_subscription = create_subscription(
            customer=self.customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id_one,
            partner=self.partner,
            total_amount=Decimal("2400.00"),
            monthly_amount=Decimal("1200.00"),
            tenure_months=2,
        )
        self.other_partner_subscription = create_subscription(
            customer=self.customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id_two,
            partner=self.other_partner,
            total_amount=Decimal("2400.00"),
            monthly_amount=Decimal("1200.00"),
            tenure_months=2,
        )

    def test_resolve_dashboard_scope_maps_supported_roles(self):
        self.assertIsInstance(resolve_dashboard_scope(self.admin), AdminScope)
        self.assertIsInstance(resolve_dashboard_scope(self.cashier), CashierScope)
        self.assertIsInstance(resolve_dashboard_scope(self.partner), PartnerScope)
        self.assertIsInstance(resolve_dashboard_scope(self.customer_user), CustomerScope)

    def test_customer_scope_requires_customer_profile(self):
        with self.assertRaises(DashboardScopeError):
            CustomerScope().get_subscription_queryset(self.customer_without_profile)

        with self.assertRaises(DashboardScopeError):
            CustomerScope().get_identity_payload(self.customer_without_profile)

    def test_partner_scope_limits_queryset_to_actor_partner(self):
        queryset = PartnerScope().get_subscription_queryset(self.partner)

        self.assertEqual(queryset.count(), 1)
        self.assertEqual(queryset.first().id, self.partner_subscription.id)

    def test_admin_and_cashier_scopes_keep_full_subscription_visibility(self):
        admin_ids = set(AdminScope().get_subscription_queryset(self.admin).values_list("id", flat=True))
        cashier_ids = set(
            CashierScope().get_subscription_queryset(self.cashier).values_list("id", flat=True)
        )

        self.assertEqual(admin_ids, cashier_ids)
        self.assertEqual(
            admin_ids,
            {self.partner_subscription.id, self.other_partner_subscription.id},
        )
