"""Server backups (database + product images/media) from the web app.

Lets the owner make a full backup on demand and download it to their own
computer / external hard disk. See business_setup.services.server_backup_service.
"""
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
