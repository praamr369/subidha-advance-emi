"""Enterprise Migration Center API — admin-only, dedicated endpoints.

Nothing here writes production data except the approved execute-import and
rollback endpoints, both of which require explicit typed confirmation.
"""

from __future__ import annotations

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from migration_center.adapters import ADAPTERS
from migration_center.datasets import DATASETS, get_dataset
from migration_center.models import (
    MigrationAuditLog, MigrationBatch, MigrationMappingRule, MigrationStagingRow, StagingRowStatus,
)
from migration_center.services import (
    import_service, pipeline_service, readiness_service,
    reconciliation_service, rollback_service, template_service, workbench_service,
)

IMPORT_CONFIRMATION = "IMPORT"
ROLLBACK_CONFIRMATION = "ROLLBACK"
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB


class AdminMigrationView(APIView):
    permission_classes = [IsAdmin]


def _batch_payload(batch: MigrationBatch, *, include_mapping: bool = True) -> dict:
    payload = {
        "id": batch.id,
        "batch_number": batch.batch_number,
        "dataset_key": batch.dataset_key,
        "dataset_label": get_dataset(batch.dataset_key).label if batch.dataset_key in DATASETS else batch.dataset_key,
        "source_type": batch.source_type,
        "status": batch.status,
        "original_filename": batch.original_filename,
        "file_checksum_sha256": batch.file_checksum_sha256,
        "file_size_bytes": batch.file_size_bytes,
        "total_rows": batch.total_rows,
        "valid_rows": batch.valid_rows,
        "warning_rows": batch.warning_rows,
        "error_rows": batch.error_rows,
        "duplicate_rows": batch.duplicate_rows,
        "imported_rows": batch.imported_rows,
        "skipped_rows": batch.skipped_rows,
        "failed_rows": batch.failed_rows,
        "preview_summary": batch.preview_summary,
        "reconciliation_snapshot": batch.reconciliation_snapshot,
        "expected_total": str(batch.expected_total) if batch.expected_total is not None else None,
        "created_at": batch.created_at,
        "created_by": getattr(batch.created_by, "username", None),
        "approved_at": batch.approved_at,
        "approved_by": getattr(batch.approved_by, "username", None),
        "import_started_at": batch.import_started_at,
        "import_finished_at": batch.import_finished_at,
        "duration_seconds": batch.duration_seconds,
        "rolled_back_at": batch.rolled_back_at,
        "notes": batch.notes,
    }
    if include_mapping:
        payload["mapping"] = batch.mapping
        payload["source_headers"] = batch.source_headers
    return payload


class MigrationOverviewView(AdminMigrationView):
    def get(self, request):
        datasets = [
            {
                "key": spec.key,
                "label": spec.label,
                "importable": spec.importable,
                "description": spec.description,
                "amount_field": spec.amount_field,
                "duplicate_keys": list(spec.duplicate_keys),
                "fields": [
                    {
                        "key": field.key, "label": field.label, "required": field.required,
                        "kind": field.kind, "choices": list(field.choices),
                    }
                    for field in spec.fields
                ],
            }
            for spec in DATASETS.values()
        ]
        sources = [{"key": key, "label": adapter.label} for key, adapter in ADAPTERS.items()]
        recent = [_batch_payload(batch, include_mapping=False) for batch in MigrationBatch.objects.all()[:10]]
        return Response({"datasets": datasets, "sources": sources, "recent_batches": recent})


class MigrationTemplateDownloadView(AdminMigrationView):
    def get(self, request, dataset_key: str):
        # Note: DRF reserves the "format" query param for content negotiation,
        # so the file format travels as "file_format".
        fmt = (request.query_params.get("file_format") or "csv").lower()
        try:
            if fmt == "xlsx":
                filename, content = template_service.template_xlsx(dataset_key)
                content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            else:
                filename, content = template_service.template_csv(dataset_key)
                content_type = "text/csv"
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        response = HttpResponse(content, content_type=content_type)
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class MigrationUploadView(AdminMigrationView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        uploaded = request.FILES.get("file")
        dataset_key = request.data.get("dataset_key") or ""
        source_type = request.data.get("source_type") or "GENERIC_CSV"
        if uploaded is None:
            return Response({"detail": "A file is required."}, status=status.HTTP_400_BAD_REQUEST)
        if uploaded.size > MAX_UPLOAD_BYTES:
            return Response({"detail": "File exceeds the 50 MB upload limit."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            batch = pipeline_service.create_batch_from_upload(
                uploaded_file=uploaded, filename=uploaded.name,
                dataset_key=dataset_key, source_type=source_type, actor=request.user,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(_batch_payload(batch), status=status.HTTP_201_CREATED)


class MigrationBatchListView(AdminMigrationView):
    def get(self, request):
        queryset = MigrationBatch.objects.all()
        dataset_key = request.query_params.get("dataset_key")
        if dataset_key:
            queryset = queryset.filter(dataset_key=dataset_key)
        status_filter = request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return Response({"batches": [_batch_payload(b, include_mapping=False) for b in queryset[:100]]})


class MigrationBatchDetailView(AdminMigrationView):
    def get(self, request, batch_id: int):
        batch = get_object_or_404(MigrationBatch, pk=batch_id)
        return Response(_batch_payload(batch))

    def delete(self, request, batch_id: int):
        """Delete a migration batch and its staging rows.

        Blocked while any row is still imported into production — the batch
        must be rolled back first so no live record is orphaned. Audit logs
        survive (batch FK is SET_NULL)."""
        batch = get_object_or_404(MigrationBatch, pk=batch_id)
        if batch.rows.filter(status=StagingRowStatus.IMPORTED).exists():
            return Response(
                {"detail": "This batch still has imported rows. Roll it back before deleting."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        number = batch.batch_number
        pipeline_service.log_action(batch=batch, action="BATCH_DELETED", actor=request.user, payload={"batch_number": number, "dataset": batch.dataset_key})
        batch.delete()
        return Response({"deleted": number})


def _row_payload(row) -> dict:
    return {
        "row_number": row.row_number, "status": row.status,
        "raw_data": row.raw_data, "mapped_data": row.mapped_data,
        "errors": row.errors, "warnings": row.warnings,
        "duplicate_matches": row.duplicate_matches,
        "duplicate_resolution": row.duplicate_resolution,
        "target_model": row.target_model, "target_pk": row.target_pk,
        "import_error": row.import_error,
    }


class MigrationBatchRowsView(AdminMigrationView):
    def get(self, request, batch_id: int):
        batch = get_object_or_404(MigrationBatch, pk=batch_id)
        queryset = batch.rows.all()
        status_filter = request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        try:
            offset = max(0, int(request.query_params.get("offset", 0)))
            limit = min(500, max(1, int(request.query_params.get("limit", 50))))
        except ValueError:
            offset, limit = 0, 50
        rows = [_row_payload(row) for row in queryset[offset:offset + limit]]
        return Response({"total": queryset.count(), "offset": offset, "limit": limit, "rows": rows})

    def post(self, request, batch_id: int):
        """Add a single row via the Data Workbench."""
        batch = get_object_or_404(MigrationBatch, pk=batch_id)
        data = request.data.get("data")
        if not isinstance(data, dict):
            return Response({"detail": "data must be an object of {field_key: value}."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            row = workbench_service.add_row(batch=batch, data=data, actor=request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"row": _row_payload(row), "batch": _batch_payload(batch, include_mapping=False)}, status=status.HTTP_201_CREATED)

    def put(self, request, batch_id: int):
        """Replace all editable rows (grid save)."""
        batch = get_object_or_404(MigrationBatch, pk=batch_id)
        rows = request.data.get("rows")
        if not isinstance(rows, list):
            return Response({"detail": "rows must be a list of {field_key: value} objects."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            count = workbench_service.bulk_set_rows(batch=batch, rows=rows, actor=request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"saved": count, "batch": _batch_payload(batch, include_mapping=False)})


class MigrationRowDetailView(AdminMigrationView):
    def patch(self, request, batch_id: int, row_number: int):
        batch = get_object_or_404(MigrationBatch, pk=batch_id)
        data = request.data.get("data")
        if not isinstance(data, dict):
            return Response({"detail": "data must be an object of {field_key: value}."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            row = workbench_service.update_row(batch=batch, row_number=row_number, data=data, actor=request.user)
        except MigrationStagingRow.DoesNotExist:
            return Response({"detail": "Row not found."}, status=status.HTTP_404_NOT_FOUND)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"row": _row_payload(row), "batch": _batch_payload(batch, include_mapping=False)})

    def delete(self, request, batch_id: int, row_number: int):
        batch = get_object_or_404(MigrationBatch, pk=batch_id)
        try:
            workbench_service.delete_row(batch=batch, row_number=row_number, actor=request.user)
        except MigrationStagingRow.DoesNotExist:
            return Response({"detail": "Row not found."}, status=status.HTTP_404_NOT_FOUND)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"batch": _batch_payload(batch, include_mapping=False)})


class MigrationWorkbenchCreateView(AdminMigrationView):
    def post(self, request):
        dataset_key = request.data.get("dataset_key") or ""
        try:
            batch = workbench_service.create_workbench_batch(dataset_key=dataset_key, actor=request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(_batch_payload(batch), status=status.HTTP_201_CREATED)


class MigrationWorkbenchAdoptView(AdminMigrationView):
    def post(self, request, batch_id: int):
        """Open an uploaded CSV/XLSX batch in the editable workbench grid."""
        batch = get_object_or_404(MigrationBatch, pk=batch_id)
        try:
            workbench_service.adopt_upload_for_editing(batch=batch, actor=request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(_batch_payload(batch))


class MigrationMappingView(AdminMigrationView):
    def get(self, request, batch_id: int):
        batch = get_object_or_404(MigrationBatch, pk=batch_id)
        dataset = get_dataset(batch.dataset_key)
        return Response({
            "mapping": batch.mapping,
            "source_headers": batch.source_headers,
            "fields": [
                {"key": f.key, "label": f.label, "required": f.required, "kind": f.kind}
                for f in dataset.fields
            ],
        })

    def put(self, request, batch_id: int):
        batch = get_object_or_404(MigrationBatch, pk=batch_id)
        mapping = request.data.get("mapping")
        if not isinstance(mapping, dict):
            return Response({"detail": "mapping must be an object of {field_key: header}."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            batch = pipeline_service.update_mapping(batch=batch, mapping=mapping, actor=request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        save_as = (request.data.get("save_as") or "").strip()
        if save_as:
            MigrationMappingRule.objects.update_or_create(
                dataset_key=batch.dataset_key, source_type=batch.source_type, name=save_as,
                defaults={"mapping": batch.mapping, "created_by": request.user},
            )
        return Response(_batch_payload(batch))


class MigrationMappingRulesView(AdminMigrationView):
    def get(self, request):
        rules = MigrationMappingRule.objects.all()
        dataset_key = request.query_params.get("dataset_key")
        if dataset_key:
            rules = rules.filter(dataset_key=dataset_key)
        return Response({"rules": [
            {"id": r.id, "name": r.name, "dataset_key": r.dataset_key, "source_type": r.source_type,
             "mapping": r.mapping, "is_default": r.is_default}
            for r in rules[:100]
        ]})


class MigrationValidateView(AdminMigrationView):
    def post(self, request, batch_id: int):
        batch = get_object_or_404(MigrationBatch, pk=batch_id)
        try:
            counts = pipeline_service.validate_batch(batch=batch, actor=request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"counts": counts, "batch": _batch_payload(batch, include_mapping=False)})


class MigrationDuplicatesView(AdminMigrationView):
    def post(self, request, batch_id: int):
        batch = get_object_or_404(MigrationBatch, pk=batch_id)
        result = pipeline_service.detect_duplicates(batch=batch, actor=request.user)
        return Response({**result, "batch": _batch_payload(batch, include_mapping=False)})

    def put(self, request, batch_id: int):
        batch = get_object_or_404(MigrationBatch, pk=batch_id)
        resolutions = request.data.get("resolutions")
        if not isinstance(resolutions, list):
            return Response({"detail": "resolutions must be a list."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            changed = pipeline_service.set_duplicate_resolutions(batch=batch, resolutions=resolutions, actor=request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"updated": changed})


class MigrationPreviewView(AdminMigrationView):
    def post(self, request, batch_id: int):
        batch = get_object_or_404(MigrationBatch, pk=batch_id)
        summary = pipeline_service.build_preview(batch=batch, actor=request.user)
        return Response({"summary": summary, "batch": _batch_payload(batch, include_mapping=False)})


class MigrationExecuteView(AdminMigrationView):
    def post(self, request, batch_id: int):
        batch = get_object_or_404(MigrationBatch, pk=batch_id)
        if (request.data.get("confirmation") or "").strip().upper() != IMPORT_CONFIRMATION:
            return Response(
                {"detail": f'Type "{IMPORT_CONFIRMATION}" in the confirmation field to execute this import.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            import_service.approve_batch(batch=batch, actor=request.user)
            result = import_service.execute_import(batch=batch, actor=request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"result": result, "batch": _batch_payload(batch, include_mapping=False)})


class MigrationRollbackView(AdminMigrationView):
    def post(self, request, batch_id: int):
        batch = get_object_or_404(MigrationBatch, pk=batch_id)
        if (request.data.get("confirmation") or "").strip().upper() != ROLLBACK_CONFIRMATION:
            return Response(
                {"detail": f'Type "{ROLLBACK_CONFIRMATION}" in the confirmation field to roll back this batch.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = rollback_service.rollback_batch(batch=batch, actor=request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"result": result, "batch": _batch_payload(batch, include_mapping=False)})


class MigrationReconciliationView(AdminMigrationView):
    def get(self, request):
        return Response(reconciliation_service.overall_reconciliation())

    def post(self, request, batch_id: int):
        batch = get_object_or_404(MigrationBatch, pk=batch_id)
        expected = request.data.get("expected_total")
        if expected not in (None, ""):
            try:
                reconciliation_service.set_expected_total(batch=batch, expected_total=expected, actor=request.user)
            except Exception:
                return Response({"detail": "expected_total must be a number."}, status=status.HTTP_400_BAD_REQUEST)
        snapshot = reconciliation_service.reconcile_batch(batch=batch, actor=request.user)
        return Response({"snapshot": snapshot})


class MigrationErrorReportView(AdminMigrationView):
    def get(self, request, batch_id: int):
        batch = get_object_or_404(MigrationBatch, pk=batch_id)
        filename, content = template_service.error_report_csv(batch)
        response = HttpResponse(content, content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class MigrationReconciliationReportView(AdminMigrationView):
    def get(self, request, batch_id: int):
        batch = get_object_or_404(MigrationBatch, pk=batch_id)
        filename, content = template_service.reconciliation_report_csv(batch)
        response = HttpResponse(content, content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class MigrationAuditLogView(AdminMigrationView):
    def get(self, request):
        logs = MigrationAuditLog.objects.select_related("batch", "actor")
        batch_id = request.query_params.get("batch_id")
        if batch_id:
            logs = logs.filter(batch_id=batch_id)
        return Response({"logs": [
            {
                "id": log.id, "action": log.action,
                "batch_number": getattr(log.batch, "batch_number", None),
                "actor": getattr(log.actor, "username", None),
                "payload": log.payload, "created_at": log.created_at,
            }
            for log in logs[:200]
        ]})


class MigrationReadinessView(AdminMigrationView):
    def get(self, request):
        return Response(readiness_service.business_readiness())
