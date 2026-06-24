"""
Staff task assignment + self-service views.

Admin assigns tasks to employees; staff list and complete their own tasks.
"""
from django.utils import timezone
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.models import EmployeeProfile, StaffTask
from api.v1.permissions import IsAdmin, IsStaff


class StaffTaskSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.CharField(
        source="assigned_to.employee_code", read_only=True
    )

    class Meta:
        model = StaffTask
        fields = (
            "id",
            "assigned_to",
            "assigned_to_name",
            "title",
            "description",
            "priority",
            "status",
            "due_date",
            "completion_note",
            "completed_at",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("completed_at", "created_by", "created_at", "updated_at")


class StaffTaskAdminViewSet(viewsets.ModelViewSet):
    """Admin CRUD for assigning staff tasks (registered under /admin/hr/)."""

    queryset = StaffTask.objects.select_related("assigned_to").all()
    serializer_class = StaffTaskSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get_queryset(self):
        queryset = super().get_queryset()
        employee = (self.request.query_params.get("assigned_to") or "").strip()
        status_param = (self.request.query_params.get("status") or "").strip()
        if employee.isdigit():
            queryset = queryset.filter(assigned_to_id=int(employee))
        if status_param:
            queryset = queryset.filter(status=status_param)
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


def _staff_employee(request):
    from api.v1.views.staff_portal import staff_identity_for_user

    return staff_identity_for_user(request.user).employee


class StaffTaskListView(APIView):
    """GET /api/v1/staff/tasks/ — the staff member's own tasks."""

    permission_classes = [permissions.IsAuthenticated, IsStaff]

    def get(self, request):
        employee = _staff_employee(request)
        tasks = employee.tasks.all().order_by("-created_at")
        status_param = (request.query_params.get("status") or "").strip()
        if status_param:
            tasks = tasks.filter(status=status_param)
        return Response(
            {"count": tasks.count(), "results": StaffTaskSerializer(tasks, many=True).data},
            status=status.HTTP_200_OK,
        )


class StaffTaskCompleteView(APIView):
    """POST /api/v1/staff/tasks/<id>/complete/ — staff marks own task done."""

    permission_classes = [permissions.IsAuthenticated, IsStaff]

    def post(self, request, pk: int):
        employee = _staff_employee(request)
        task = employee.tasks.filter(pk=pk).first()
        if task is None:
            return Response(
                {"detail": "Task not found."}, status=status.HTTP_404_NOT_FOUND
            )
        if task.status in (StaffTask.Status.DONE, StaffTask.Status.CANCELLED):
            return Response(
                {"detail": "Task is already closed."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        new_status = (request.data.get("status") or StaffTask.Status.DONE).strip().upper()
        if new_status not in (StaffTask.Status.IN_PROGRESS, StaffTask.Status.DONE):
            new_status = StaffTask.Status.DONE
        task.status = new_status
        task.completion_note = (request.data.get("note") or "").strip()
        if new_status == StaffTask.Status.DONE:
            task.completed_at = timezone.now()
        task.save(
            update_fields=["status", "completion_note", "completed_at", "updated_at"]
        )
        return Response(StaffTaskSerializer(task).data, status=status.HTTP_200_OK)
