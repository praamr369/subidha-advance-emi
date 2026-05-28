from rest_framework import permissions, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.capabilities import require_capability
from api.v1.permissions import IsAdmin
from api.v1.serializers.business_setup import (
    BackupJobCreateSerializer,
    BusinessProfileSerializer,
    BusinessResetRequestSerializer,
    BusinessResetResponseSerializer,
    DocumentNumberingStateSerializer,
    DocumentNumberingUpdateSerializer,
    DocumentPrintSettingsSerializer,
    ModularResetExecuteRequestSerializer,
    ResetScopePreviewRequestSerializer,
    RestoreExecuteRequestSerializer,
    SetupSnapshotImportSerializer,
    LocalSandboxSeedSerializer,
    LocalSandboxResetSerializer,
    RestorePreviewRequestSerializer,
    SetupChecklistSerializer,
)
from subscriptions.models_business_setup import BusinessDataBackupJob, BusinessDataRestoreJob
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
from subscriptions.services.document_print_settings_service import get_or_create_document_print_settings
from subscriptions.services.business_reset_governance_service import (
    build_reset_preview,
    create_backup_job,
    create_restore_preview,
    create_setup_snapshot_restore_preview,
    execute_modular_reset,
    execute_restore,
    list_backup_jobs,
    list_reset_scopes,
)
from subscriptions.services.setup_readiness_service import get_setup_readiness
from subscriptions.services.setup_snapshot_service import export_setup_snapshot, import_setup_snapshot
from subscriptions.services.local_sandbox_seed_service import seed_local_sandbox
from subscriptions.services.selective_reset_service import execute_selective_reset
from subscriptions.services.setup_checklist_service import compute_setup_checklist
from django.conf import settings


class AdminBusinessProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request):
        if request.query_params.get("section") == "document-print-settings":
            settings_obj = get_or_create_document_print_settings()
            return Response(
                DocumentPrintSettingsSerializer(settings_obj, context={"request": request}).data,
                status=status.HTTP_200_OK,
            )
        profile = get_active_business_profile()
        if not profile:
            return Response({"detail": "Business profile is not configured yet."}, status=status.HTTP_404_NOT_FOUND)
        payload = BusinessProfileSerializer(profile).data
        settings_obj = get_or_create_document_print_settings()
        payload["document_print_settings"] = DocumentPrintSettingsSerializer(settings_obj, context={"request": request}).data
        return Response(payload)

    def put(self, request):
        return self._save(request, partial=False)

    def patch(self, request):
        return self._save(request, partial=True)

    def _save(self, request, partial: bool):
        if request.query_params.get("section") == "document-print-settings":
            settings_obj = get_or_create_document_print_settings()
            serializer = DocumentPrintSettingsSerializer(
                settings_obj,
                data=request.data,
                partial=True,
                context={"request": request},
            )
            serializer.is_valid(raise_exception=True)
            settings_obj = serializer.save()
            return Response(
                DocumentPrintSettingsSerializer(settings_obj, context={"request": request}).data,
                status=status.HTTP_200_OK,
            )
        instance = get_active_business_profile()
        serializer = BusinessProfileSerializer(instance=instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        profile = upsert_business_profile(data=serializer.validated_data, instance=instance)
        payload = BusinessProfileSerializer(profile).data
        settings_obj = get_or_create_document_print_settings()
        payload["document_print_settings"] = DocumentPrintSettingsSerializer(settings_obj, context={"request": request}).data
        return Response(payload, status=status.HTTP_200_OK)


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


class BusinessSetupResetScopesView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        return Response({"scopes": list_reset_scopes()}, status=status.HTTP_200_OK)


class BusinessSetupModularResetPreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        serializer = ResetScopePreviewRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        payload = build_reset_preview(
            scopes=list(data["scopes"]),
            preserve_username=data["preserve_username"],
            preserve_user_ids=list(data.get("preserve_user_ids") or []),
        )
        return Response(payload, status=status.HTTP_200_OK)


class BusinessSetupModularResetExecuteView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    @require_capability("business_setup.reset")
    def post(self, request):
        serializer = ModularResetExecuteRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            payload = execute_modular_reset(
                scopes=list(data["scopes"]),
                preserve_username=data["preserve_username"],
                confirmation_phrase=data["confirmation_phrase"],
                backup_job_id=data.get("backup_job_id"),
                performed_by=request.user,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(payload, status=status.HTTP_200_OK)


class BusinessSetupBackupJobsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        jobs = list_backup_jobs(limit=100)
        return Response(
            {
                "jobs": [
                    {
                        "id": job.id,
                        "job_type": job.job_type,
                        "status": job.status,
                        "scopes": job.scopes,
                        "checksum": job.checksum,
                        "row_counts": job.row_counts,
                        "created_at": job.created_at,
                        "completed_at": job.completed_at,
                        "expires_at": job.expires_at,
                        "requested_by": getattr(job.requested_by, "username", None),
                    }
                    for job in jobs
                ]
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        serializer = BackupJobCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        job = create_backup_job(
            requested_by=request.user,
            scopes=list(serializer.validated_data["scopes"]),
            job_type=serializer.validated_data["job_type"],
        )
        return Response({"id": job.id, "status": job.status, "checksum": job.checksum}, status=status.HTTP_201_CREATED)


class BusinessSetupBackupJobDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        job = BusinessDataBackupJob.objects.select_related("requested_by").filter(pk=pk).first()
        if not job:
            return Response({"detail": "Backup job not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            {
                "id": job.id,
                "job_type": job.job_type,
                "status": job.status,
                "scopes": job.scopes,
                "checksum": job.checksum,
                "file_path": job.file_path,
                "row_counts": job.row_counts,
                "metadata": job.metadata,
                "error_message": job.error_message,
                "requested_by": getattr(job.requested_by, "username", None),
                "created_at": job.created_at,
                "completed_at": job.completed_at,
                "expires_at": job.expires_at,
            },
            status=status.HTTP_200_OK,
        )


class BusinessSetupBackupJobDownloadView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        from pathlib import Path
        from django.http import FileResponse

        job = BusinessDataBackupJob.objects.filter(pk=pk).first()
        if not job:
            return Response({"detail": "Backup job not found."}, status=status.HTTP_404_NOT_FOUND)
        file_path = Path(job.file_path)
        if not file_path.exists():
            return Response({"detail": "Backup file not found on server."}, status=status.HTTP_404_NOT_FOUND)
        return FileResponse(open(file_path, "rb"), as_attachment=True, filename=file_path.name)


class BusinessSetupRestorePreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        serializer = RestorePreviewRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        restore_type = data.get("restore_type") or "FULL_BACKUP_RESTORE_PREVIEW"
        try:
            if restore_type == "SETUP_SNAPSHOT_RESTORE_PREVIEW":
                payload = data.get("snapshot_payload")
                if not isinstance(payload, dict):
                    return Response({"detail": "snapshot_payload JSON object is required for setup snapshot preview."}, status=status.HTTP_400_BAD_REQUEST)
                preserve_admin = (data.get("preserve_admin_username") or request.user.username or "").strip()
                job = create_setup_snapshot_restore_preview(
                    requested_by=request.user,
                    snapshot_payload=payload,
                    preserve_admin_username=preserve_admin,
                )
            else:
                backup_job_id = data.get("backup_job_id")
                if not backup_job_id:
                    return Response({"detail": "backup_job_id is required for this restore preview type."}, status=status.HTTP_400_BAD_REQUEST)
                backup_job = BusinessDataBackupJob.objects.filter(pk=backup_job_id).first()
                if not backup_job:
                    return Response({"detail": "Backup job not found."}, status=status.HTTP_404_NOT_FOUND)
                job = create_restore_preview(
                    requested_by=request.user,
                    backup_job=backup_job,
                    scopes=list(data.get("scopes") or []),
                )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"restore_job_id": job.id, "status": job.status, "preview": job.preview}, status=status.HTTP_200_OK)


class BusinessSetupRestoreExecuteView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        serializer = RestoreExecuteRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        job = BusinessDataRestoreJob.objects.select_related("backup_job").filter(pk=serializer.validated_data["restore_job_id"]).first()
        if not job:
            return Response({"detail": "Restore job not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            updated = execute_restore(
                restore_job=job,
                confirmation_phrase=serializer.validated_data["confirmation_phrase"],
                requested_by=request.user,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"id": updated.id, "status": updated.status, "completed_at": updated.completed_at}, status=status.HTTP_200_OK)


class BusinessSetupRestoreJobsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        jobs = BusinessDataRestoreJob.objects.select_related("requested_by", "backup_job").order_by("-created_at")[:100]
        return Response(
            {
                "jobs": [
                    {
                        "id": job.id,
                        "status": job.status,
                        "backup_job_id": job.backup_job_id,
                        "selected_scopes": job.selected_scopes,
                        "preview": job.preview,
                        "error_message": job.error_message,
                        "created_at": job.created_at,
                        "completed_at": job.completed_at,
                        "requested_by": getattr(job.requested_by, "username", None),
                    }
                    for job in jobs
                ]
            },
            status=status.HTTP_200_OK,
        )


class BusinessSetupRestoreJobDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        job = BusinessDataRestoreJob.objects.select_related("requested_by", "backup_job", "approved_by").filter(pk=pk).first()
        if not job:
            return Response({"detail": "Restore job not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            {
                "id": job.id,
                "status": job.status,
                "backup_job_id": job.backup_job_id,
                "selected_scopes": job.selected_scopes,
                "package_type": job.package_type,
                "package_checksum": job.package_checksum,
                "preview": job.preview,
                "error_message": job.error_message,
                "requested_by": getattr(job.requested_by, "username", None),
                "approved_by": getattr(job.approved_by, "username", None),
                "created_at": job.created_at,
                "completed_at": job.completed_at,
            },
            status=status.HTTP_200_OK,
        )


def _sandbox_enabled() -> bool:
    env = (getattr(settings, "ENVIRONMENT_NAME", "") or "").lower()
    return bool(settings.DEBUG or env in {"development", "test", "local"})


class AdminSetupReadinessView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        return Response(get_setup_readiness(), status=status.HTTP_200_OK)


class AdminSetupSnapshotExportView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        if not _sandbox_enabled():
            return Response({"detail": "Local sandbox tools are disabled in this environment."}, status=status.HTTP_403_FORBIDDEN)
        payload = export_setup_snapshot().payload
        return Response(payload, status=status.HTTP_200_OK)


class AdminSetupSnapshotImportView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        if not _sandbox_enabled():
            return Response({"detail": "Local sandbox tools are disabled in this environment."}, status=status.HTTP_403_FORBIDDEN)
        serializer = SetupSnapshotImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if not data.get("dry_run") and not data.get("confirm"):
            return Response({"detail": "Set confirm=true to apply import."}, status=status.HTTP_400_BAD_REQUEST)
        result = import_setup_snapshot(payload=data["payload"], dry_run=bool(data.get("dry_run", True)))
        return Response(result, status=status.HTTP_200_OK)


class AdminLocalSandboxSeedView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        if not _sandbox_enabled():
            return Response({"detail": "Local sandbox tools are disabled in this environment."}, status=status.HTTP_403_FORBIDDEN)
        serializer = LocalSandboxSeedSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not serializer.validated_data.get("confirm"):
            return Response({"detail": "confirm=true is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            result = seed_local_sandbox(performed_by=request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result, status=status.HTTP_200_OK)


class AdminLocalSandboxResetView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        if not _sandbox_enabled():
            return Response({"detail": "Local sandbox tools are disabled in this environment."}, status=status.HTTP_403_FORBIDDEN)
        serializer = LocalSandboxResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = execute_selective_reset(**serializer.validated_data)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result, status=status.HTTP_200_OK)
