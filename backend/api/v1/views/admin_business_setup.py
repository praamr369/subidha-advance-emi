from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.capabilities import require_capability
from api.v1.permissions import IsAdmin
from api.v1.serializers.business_setup import (
    BusinessProfileSerializer,
    BusinessResetRequestSerializer,
    BusinessResetResponseSerializer,
    DocumentNumberingStateSerializer,
    DocumentNumberingUpdateSerializer,
    SetupChecklistSerializer,
)
from subscriptions.services.business_setup_service import (
    get_active_business_profile,
    get_reset_preview,
    upsert_business_profile,
)
from subscriptions.services.business_reset_service import (
    BusinessResetOptions,
    RESET_CONFIRMATION,
    build_business_reset_plan,
    execute_business_reset,
)
from subscriptions.services.document_numbering_service import (
    NUMBERING_BY_KEY,
    get_document_numbering_state,
    upsert_document_numbering,
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


class BusinessSetupDocumentNumberingView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        payload = get_document_numbering_state()
        serializer = DocumentNumberingStateSerializer(payload)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request):
        serializer = DocumentNumberingUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        key = serializer.validated_data["key"]
        current = get_document_numbering_state()
        sequence_row = next((row for row in current["sequences"] if row["key"] == key), None)
        if sequence_row is None:
            return Response({"key": ["Unsupported numbering key."]}, status=status.HTTP_400_BAD_REQUEST)
        spec = NUMBERING_BY_KEY[key]
        try:
            upsert_document_numbering(
                key=key,
                prefix=serializer.validated_data.get("prefix", sequence_row["prefix"]),
                next_number=serializer.validated_data.get("next_number", sequence_row["next_number"]),
                padding=serializer.validated_data.get("padding", sequence_row["padding"]),
                performed_by=request.user,
            )
        except ValueError as exc:
            return Response({"detail": str(exc), "key": key, "series_code": spec.series_code}, status=status.HTTP_400_BAD_REQUEST)
        payload = get_document_numbering_state()
        return Response(DocumentNumberingStateSerializer(payload).data, status=status.HTTP_200_OK)


class BusinessSetupResetPreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        preserve_username = (request.query_params.get("preserve_username") or "").strip()
        preserved_username = preserve_username or (request.user.username or "").strip()
        options = BusinessResetOptions(
            preserve_usernames=(preserved_username,),
            preserve_superusers=False,
            delete_non_preserved_users=True,
            clear_auth_artifacts=True,
        )
        plan = build_business_reset_plan(options=options)
        return Response(
            {
                "mode": "read_only_preview",
                "business_setup_master_counts": get_reset_preview(),
                "reset_plan": plan,
                "warnings": [
                    "Preview is dry-run only; no data is mutated.",
                    "Real reset requires confirm=true and preserved admin username.",
                ],
            }
        )


class BusinessSetupResetExecuteView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    @require_capability("business_setup.reset")
    def post(self, request):
        serializer = BusinessResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        preserve_username = serializer.validated_data["preserve_username"]
        delete_non_preserved_users = bool(serializer.validated_data["delete_non_preserved_users"])
        clear_auth_artifacts = bool(serializer.validated_data["clear_auth_artifacts"])
        dry_run = bool(serializer.validated_data["dry_run"])
        confirm = bool(serializer.validated_data["confirm"])

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
            payload = execute_business_reset(
                options=options,
                confirm=RESET_CONFIRMATION if confirm else "",
                dry_run=dry_run,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        payload["deleted_counts"] = {
            "target_models": payload.get("targets", {}).get("model_count", 0),
            "target_rows": payload.get("targets", {}).get("total_rows", 0),
            "auth_artifact_models": payload.get("auth_artifacts", {}).get("model_count", 0),
            "auth_artifact_rows": payload.get("auth_artifacts", {}).get("total_rows", 0),
            "deletable_user_count": payload.get("deletable_user_count", 0),
        }
        payload["post_reset_checklist"] = compute_setup_checklist()
        payload["next_setup_steps"] = [
            "business profile",
            "branch",
            "cash desk/counter",
            "finance accounts",
            "chart of accounts mapping",
            "staff",
            "products",
            "batch",
        ]
        response_serializer = BusinessResetResponseSerializer(instance=payload)
        return Response(response_serializer.data, status=status.HTTP_200_OK)
