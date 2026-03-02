from rest_framework.permissions import BasePermission


class HasRole(BasePermission):
    allowed_roles: tuple[str, ...] = tuple()

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and getattr(user, "role", None) in self.allowed_roles
        )


class IsAdmin(HasRole):
    allowed_roles = ("ADMIN",)


class IsPartner(HasRole):
    allowed_roles = ("PARTNER",)


class IsCustomer(HasRole):
    allowed_roles = ("CUSTOMER",)


class IsPartnerOrAdmin(HasRole):
    allowed_roles = ("PARTNER", "ADMIN")


# Backward-compatible alias for existing endpoint naming.


class IsCashierOrAdmin(BasePermission):

    def has_permission(self, request, view):

        # 🔒 FIRST CHECK AUTHENTICATION
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_superuser:
            return True

        # 🔒 SAFE ROLE CHECK
        return getattr(request.user, "role", None) in ["CASHIER", "ADMIN"]