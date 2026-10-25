"""Server backups (database + product images/media) from the web app.

Lets the owner make a full backup on demand and download it to their own
computer / external hard disk. See business_setup.services.server_backup_service.
"""
from pathlib import Path

from django.http import FileResponse
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from business_setup.services import server_backup_service as backups
from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit


class AdminServerBackupsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        return Response(backups.overview(), status=status.HTTP_200_OK)

    def post(self, request):
        include_database = request.data.get("include_database", True) not in (False, "false", "0", 0)
        try:
            backup = backups.create_backup(include_database=include_database)
        except backups.ServerBackupError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=request.user,
            performed_by=request.user,
            metadata={"event": "SERVER_BACKUP_CREATED", "backup": backup["name"], "include_database": include_database},
        )
        return Response({"backup": backup}, status=status.HTTP_201_CREATED)


class AdminServerBackupDownloadView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, name: str, filename: str):
        try:
            path = backups.resolve_download(name, filename)
        except FileNotFoundError:
            return Response({"detail": "Backup file not found."}, status=status.HTTP_404_NOT_FOUND)
        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=request.user,
            performed_by=request.user,
            metadata={"event": "SERVER_BACKUP_DOWNLOADED", "backup": name, "file": filename},
        )
        return FileResponse(
            path.open("rb"),
            as_attachment=True,
            filename=f"subidha-{name}-{filename}",
            content_type="application/octet-stream",
        )


class AdminCloudStorageSettingsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        from api.v1.serializers.business_setup import FreeCloudStorageSettingsSerializer

        settings_obj = backups.get_or_create_cloud_storage_settings()
        return Response(FreeCloudStorageSettingsSerializer(settings_obj).data, status=status.HTTP_200_OK)

    def patch(self, request):
        from api.v1.serializers.business_setup import FreeCloudStorageSettingsSerializer

        settings_obj = backups.get_or_create_cloud_storage_settings()
        serializer = FreeCloudStorageSettingsSerializer(settings_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        settings_obj = serializer.save()
        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=request.user,
            performed_by=request.user,
            metadata={
                "event": "CLOUD_STORAGE_SETTINGS_UPDATED",
                "provider": settings_obj.provider,
                "is_enabled": settings_obj.is_enabled,
                "endpoint_url": settings_obj.endpoint_url,
                "bucket_name": settings_obj.bucket_name,
            },
        )
        return Response(FreeCloudStorageSettingsSerializer(settings_obj).data, status=status.HTTP_200_OK)


class AdminCloudStorageTestView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        result = backups.test_cloud_connection()
        status_code = status.HTTP_200_OK if result.get("success") else status.HTTP_400_BAD_REQUEST
        return Response(result, status=status_code)


class AdminServerBackupCloudSyncView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        backup_name = request.data.get("name")
        create_and_sync = request.data.get("create_and_sync", False)

        try:
            if create_and_sync:
                include_database = request.data.get("include_database", True) not in (False, "false", "0", 0)
                res = backups.create_and_sync_backup(include_database=include_database)
                log_audit(
                    action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
                    instance=request.user,
                    performed_by=request.user,
                    metadata={"event": "SERVER_BACKUP_CREATED_AND_SYNCED", "backup": res["backup"]["name"]},
                )
                return Response(res, status=status.HTTP_201_CREATED)
            elif backup_name:
                res = backups.sync_backup_to_cloud(str(backup_name))
                log_audit(
                    action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
                    instance=request.user,
                    performed_by=request.user,
                    metadata={"event": "SERVER_BACKUP_SYNCED_TO_CLOUD", "backup": backup_name},
                )
                return Response(res, status=status.HTTP_200_OK)
            else:
                return Response({"detail": "Provide 'name' or 'create_and_sync'."}, status=status.HTTP_400_BAD_REQUEST)
        except backups.ServerBackupError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class AdminStorageMaintenanceView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        return Response(backups.get_storage_maintenance_stats(), status=status.HTTP_200_OK)

    def post(self, request):
        prune_tokens = request.data.get("prune_tokens", True)
        prune_sessions = request.data.get("prune_sessions", True)
        run_vacuum = request.data.get("run_vacuum", False)

        result = backups.run_storage_maintenance_cleanup(
            prune_tokens=prune_tokens,
            prune_sessions=prune_sessions,
            run_vacuum=run_vacuum,
        )
        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=request.user,
            performed_by=request.user,
            metadata={"event": "STORAGE_MAINTENANCE_EXECUTED", "actions": result.get("actions_taken")},
        )
        return Response(result, status=status.HTTP_200_OK)


class AdminBatchArchiveExportView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        return Response(backups.list_completed_batches_for_archive(), status=status.HTTP_200_OK)

    def post(self, request):
        batch_id = request.data.get("batch_id")
        if not batch_id:
            return Response({"detail": "batch_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        push_to_cloud = request.data.get("push_to_cloud", False)

        try:
            res = backups.export_batch_archive(batch_id=int(batch_id), push_to_cloud=push_to_cloud)
            log_audit(
                action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
                instance=request.user,
                performed_by=request.user,
                metadata={"event": "BATCH_ARCHIVE_EXPORTED", "batch_id": batch_id, "filename": res["filename"]},
            )
            return Response(res, status=status.HTTP_201_CREATED)
        except backups.ServerBackupError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class AdminBatchArchiveDownloadView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, filename: str):
        safe_filename = Path(filename).name
        archive_path = backups.backup_root() / "archives" / safe_filename
        if not archive_path.is_file():
            return Response({"detail": "Archive file not found."}, status=status.HTTP_404_NOT_FOUND)

        return FileResponse(
            archive_path.open("rb"),
            as_attachment=True,
            filename=safe_filename,
            content_type="application/gzip",
        )

