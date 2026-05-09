from __future__ import annotations

from dataclasses import dataclass

from branch_control.services.branch_service import scope_queryset_to_user_branches
from core.services.operational_visibility import filter_dashboard_visible_subscriptions
from subscriptions.services.subscription_financial_service import (
    get_subscription_detail_queryset,
)


class DashboardScopeError(ValueError):
    pass


@dataclass(frozen=True)
class DashboardScope:
    code: str
    label: str

    def get_subscription_queryset(self, actor_user):
        raise NotImplementedError

    def get_identity_payload(self, actor_user) -> dict[str, object]:
        return {}


@dataclass(frozen=True)
class AdminScope(DashboardScope):
    code: str = "ADMIN"
    label: str = "Admin"

    def get_subscription_queryset(self, actor_user):
        return filter_dashboard_visible_subscriptions(get_subscription_detail_queryset())


@dataclass(frozen=True)
class PartnerScope(DashboardScope):
    code: str = "PARTNER"
    label: str = "Partner"

    def get_subscription_queryset(self, actor_user):
        return filter_dashboard_visible_subscriptions(
            get_subscription_detail_queryset().filter(partner=actor_user)
        )

    def get_identity_payload(self, actor_user) -> dict[str, object]:
        return {
            "partner": {
                "id": actor_user.id,
                "username": getattr(actor_user, "username", "") or "",
                "email": getattr(actor_user, "email", "") or "",
                "phone": getattr(actor_user, "phone", "") or "",
                "role": getattr(actor_user, "role", "") or "",
            }
        }


@dataclass(frozen=True)
class CashierScope(DashboardScope):
    code: str = "CASHIER"
    label: str = "Cashier"

    def get_subscription_queryset(self, actor_user):
        return filter_dashboard_visible_subscriptions(scope_queryset_to_user_branches(
            get_subscription_detail_queryset(),
            user=actor_user,
            field_name="branch_id",
        ))


@dataclass(frozen=True)
class CustomerScope(DashboardScope):
    code: str = "CUSTOMER"
    label: str = "Customer"

    def get_subscription_queryset(self, actor_user):
        customer = getattr(actor_user, "customer_profile", None)
        if customer is None:
            raise DashboardScopeError("customer profile missing")
        return filter_dashboard_visible_subscriptions(
            get_subscription_detail_queryset().filter(customer=customer)
        )

    def get_identity_payload(self, actor_user) -> dict[str, object]:
        customer = getattr(actor_user, "customer_profile", None)
        if customer is None:
            raise DashboardScopeError("customer profile missing")
        return {
            "customer": {
                "id": customer.id,
                "name": customer.name,
                "phone": customer.phone,
                "kyc_status": customer.kyc_status,
            }
        }


def resolve_dashboard_scope(actor_user) -> DashboardScope:
    role = getattr(actor_user, "role", "") or ""
    if role == "ADMIN":
        return AdminScope()
    if role == "PARTNER":
        return PartnerScope()
    if role == "CASHIER":
        return CashierScope()
    if role == "CUSTOMER":
        return CustomerScope()
    raise DashboardScopeError("unsupported dashboard role")
