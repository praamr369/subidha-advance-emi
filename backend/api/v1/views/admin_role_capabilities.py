from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.capabilities import user_has_capability
from accounts.models import Capability, RoleCapability, UserCapabilityOverride, UserRole
from api.v1.permissions import IsAdmin

User = get_user_model()
MANAGED_ROLES = [UserRole.ADMIN, UserRole.CASHIER, UserRole.PARTNER, UserRole.CUSTOMER]


class RoleCapabilityPatchSerializer(serializers.Serializer):
    capabilities = serializers.DictField(
        child=serializers.BooleanField(),
        allow_empty=False,
    )


class UserOverridePatchSerializer(serializers.Serializer):
    overrides = serializers.DictField(
        child=serializers.BooleanField(),
        allow_empty=False,
    )
    note = serializers.CharField(required=False, allow_blank=True, max_length=255)


def _fetch_capability_rows():
    return list(Capability.objects.filter(is_active=True).order_by("code", "id"))


def _role_codes_map(role: str, capability_rows: list[Capability]) -> dict[str, bool]:
    by_code = {
        row.capability.code: bool(row.is_allowed)
        for row in RoleCapability.objects.select_related("capability").filter(
            role=role,
            capability__is_active=True,
        )
    }
    return {cap.code: bool(by_code.get(cap.code, False)) for cap in capability_rows}


class AdminRolePermissionMatrixView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        capability_rows = _fetch_capability_rows()
        role_matrix = {
            role: _role_codes_map(role, capability_rows)
            for role in MANAGED_ROLES
        }
        return Response(
            {
                "capabilities": [
                    {
                        "code": cap.code,
                        "label": cap.label,
                        "description": cap.description,
                    }
                    for cap in capability_rows
                ],
                "roles": role_matrix,
            },
            status=status.HTTP_200_OK,
        )


class AdminRolePermissionUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def patch(self, request, role: str):
        normalized_role = (role or "").strip().upper()
        if normalized_role not in set(MANAGED_ROLES):
            return Response(
                {"detail": "Unsupported role."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = RoleCapabilityPatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        payload = serializer.validated_data["capabilities"]
        capability_rows = {
            cap.code: cap
            for cap in _fetch_capability_rows()
        }
        unknown_codes = sorted(set(payload.keys()) - set(capability_rows.keys()))
        if unknown_codes:
            return Response(
                {"detail": f"Unsupported capability code(s): {', '.join(unknown_codes)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        for code, is_allowed in payload.items():
            RoleCapability.objects.update_or_create(
                role=normalized_role,
                capability=capability_rows[code],
                defaults={"is_allowed": bool(is_allowed)},
            )

        refreshed = _role_codes_map(normalized_role, list(capability_rows.values()))
        return Response(
            {"role": normalized_role, "capabilities": refreshed},
            status=status.HTTP_200_OK,
        )


class AdminUserCapabilityOverrideView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        queryset = User.objects.filter(role__in=MANAGED_ROLES).order_by("username", "id")
        if q:
            queryset = queryset.filter(username__icontains=q)[:50]
        else:
            queryset = queryset[:50]

        capability_rows = _fetch_capability_rows()
        overrides_by_user = {}
        for row in UserCapabilityOverride.objects.select_related("capability").filter(
            user__in=queryset,
            capability__is_active=True,
        ):
            overrides_by_user.setdefault(row.user_id, {})[row.capability.code] = bool(row.is_allowed)

        results = []
        for user in queryset:
            effective = {
                cap.code: user_has_capability(user, cap.code)
                for cap in capability_rows
            }
            results.append(
                {
                    "id": user.id,
                    "username": user.username,
                    "role": user.role,
                    "overrides": overrides_by_user.get(user.id, {}),
                    "effective": effective,
                }
            )

        return Response({"count": len(results), "results": results}, status=status.HTTP_200_OK)

    def patch(self, request, user_id: int):
        user = User.objects.filter(id=user_id, role__in=MANAGED_ROLES).first()
        if user is None:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = UserOverridePatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data["overrides"]
        note = (serializer.validated_data.get("note") or "").strip()

        capability_rows = {
            cap.code: cap
            for cap in _fetch_capability_rows()
        }
        unknown_codes = sorted(set(payload.keys()) - set(capability_rows.keys()))
        if unknown_codes:
            return Response(
                {"detail": f"Unsupported capability code(s): {', '.join(unknown_codes)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        for code, is_allowed in payload.items():
            UserCapabilityOverride.objects.update_or_create(
                user=user,
                capability=capability_rows[code],
                defaults={
                    "is_allowed": bool(is_allowed),
                    "note": note,
                    "updated_by": request.user,
                    "created_by": request.user,
                },
            )

        refreshed_overrides = {
            row.capability.code: bool(row.is_allowed)
            for row in UserCapabilityOverride.objects.select_related("capability").filter(
                user=user,
                capability__is_active=True,
            )
        }
        return Response(
            {
                "id": user.id,
                "username": user.username,
                "role": user.role,
                "overrides": refreshed_overrides,
            },
            status=status.HTTP_200_OK,
        )
