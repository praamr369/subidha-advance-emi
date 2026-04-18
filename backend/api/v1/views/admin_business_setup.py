from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.business_setup import (
    BusinessProfileSerializer,
    BusinessResetRequestSerializer,
    BusinessResetResponseSerializer,
    SetupChecklistSerializer,
)
from subscriptions.services.business_setup_service import (
    get_active_business_profile,
    get_reset_preview,
    upsert_business_profile,
)
from subscriptions.services.business_reset_service import (
    BusinessResetOptions,
    build_business_reset_plan,
    execute_business_reset,
)
from subscriptions.services.setup_checklist_service import compute_setup_checklist


class AdminBusinessProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        profile = get_active_business_profile()
        if not profile:
            return Response({"detail": "Business profile is not configured yet."}, status=status.HTTP_404_NOT_FOUND)
        return Response(BusinessProfileSerializer(profile).data)

    def put(self, request):
        return self._save(request, partial=False)

    def patch(self, request):
        return self._save(request, partial=True)

    def _save(self, request, partial: bool):
        instance = get_active_business_profile()
        serializer = BusinessProfileSerializer(instance=instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        profile = upsert_business_profile(data=serializer.validated_data, instance=instance)
        return Response(BusinessProfileSerializer(profile).data, status=status.HTTP_200_OK)


class BusinessSetupChecklistView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        payload = compute_setup_checklist()
        serializer = SetupChecklistSerializer(payload)
        return Response(serializer.data)


class BusinessSetupResetPreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        preserve_username = (request.query_params.get("preserve_username") or "").strip()
        if preserve_username:
            options = BusinessResetOptions(
                preserve_usernames=(preserve_username,),
                preserve_superusers=False,
                delete_non_preserved_users=True,
                clear_auth_artifacts=True,
            )
            plan = build_business_reset_plan(options=options)
        else:
            plan = None
        return Response(
            {
                "mode": "read_only_preview",
                "business_setup_master_counts": get_reset_preview(),
                "reset_plan": plan,
            }
        )


class BusinessSetupResetExecuteView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        serializer = BusinessResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        preserve_username = serializer.validated_data["preserve_username"]
        delete_non_preserved_users = bool(serializer.validated_data["delete_non_preserved_users"])
        clear_auth_artifacts = bool(serializer.validated_data["clear_auth_artifacts"])
        dry_run = bool(serializer.validated_data["dry_run"])
        confirm = serializer.validated_data["confirm"]

        # Extra safety: only the admin that will be preserved may execute the reset.
        # This prevents an admin from accidentally deleting the login they intend to keep.
        if (request.user.username or "").strip() != preserve_username:
            return Response(
                {"detail": "Reset can only be executed by the preserved admin username."},
                status=status.HTTP_403_FORBIDDEN,
            )

        options = BusinessResetOptions(
            preserve_usernames=(preserve_username,),
            preserve_superusers=False,
            delete_non_preserved_users=delete_non_preserved_users,
            clear_auth_artifacts=clear_auth_artifacts,
        )

        try:
            payload = execute_business_reset(options=options, confirm=confirm, dry_run=dry_run)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        response_serializer = BusinessResetResponseSerializer(payload)
        response_serializer.is_valid(raise_exception=False)
        return Response(response_serializer.data, status=status.HTTP_200_OK)
