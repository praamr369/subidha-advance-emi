from rest_framework.permissions import BasePermission


def _user_role(request):
    user = getattr(request, "user", None)
    if not user or not user.is_authenticated:
        return None
    return getattr(user, "role", None)


class HasRole(BasePermission):
    allowed_roles: tuple[str, ...] = tuple()

    def has_permission(self, request, view):
        role = _user_role(request)
        return bool(role and role in self.allowed_roles)


class IsAdmin(HasRole):
    allowed_roles = ("ADMIN",)


class IsPartner(HasRole):
    allowed_roles = ("PARTNER",)


class IsCustomer(HasRole):
    allowed_roles = ("CUSTOMER",)


class IsPartnerOrAdmin(HasRole):
    allowed_roles = ("PARTNER", "ADMIN")


class IsCashier(HasRole):
    allowed_roles = ("CASHIER",)


class IsVendor(HasRole):
    allowed_roles = ("VENDOR",)


class IsStaff(HasRole):
    allowed_roles = ("STAFF",)


class IsCashierOrAdmin(BasePermission):
    """
    Backward-compatible permission for cashier/admin flows.

    Current accounts.User.role choices in your repo are:
    - ADMIN
    - PARTNER
    - CUSTOMER
    - CASHIER
    - VENDOR
    - STAFF
    """

    allowed_roles = ("CASHIER", "ADMIN")

    def has_permission(self, request, view):
        role = _user_role(request)
        return bool(role and role in self.allowed_roles)
