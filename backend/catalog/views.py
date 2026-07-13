from django.db.models import Count, Q
from rest_framework import permissions, viewsets

from api.v1.permissions import IsAdmin
from catalog.models import AttributeDefinition, CatalogCategory
from catalog.serializers import AttributeDefinitionSerializer, CatalogCategorySerializer
from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit


class CatalogAdminViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def perform_create(self, serializer):
        instance = serializer.save()
        log_audit(action_type=AuditLog.ActionType.CATALOG_CREATED, instance=instance, performed_by=self.request.user, metadata={"event": "CATALOG_CREATED"})

    def perform_update(self, serializer):
        instance = serializer.save()
        log_audit(action_type=AuditLog.ActionType.CATALOG_UPDATED, instance=instance, performed_by=self.request.user, metadata={"event": "CATALOG_UPDATED"})


class CatalogCategoryViewSet(CatalogAdminViewSet):
    serializer_class = CatalogCategorySerializer

    def get_queryset(self):
        queryset = CatalogCategory.objects.select_related("parent").annotate(children_count=Count("children", distinct=True))
        query = (self.request.query_params.get("q") or "").strip()
        parent_id = (self.request.query_params.get("parent") or "").strip()
        if query:
            queryset = queryset.filter(Q(name__icontains=query) | Q(path__icontains=query) | Q(slug__icontains=query))
        if parent_id.isdigit():
            queryset = queryset.filter(parent_id=int(parent_id))
        return queryset.order_by("path", "sort_order", "name", "id")


class AttributeDefinitionViewSet(CatalogAdminViewSet):
    serializer_class = AttributeDefinitionSerializer

    def get_queryset(self):
        queryset = AttributeDefinition.objects.select_related("category")
        category_id = (self.request.query_params.get("category") or "").strip()
        query = (self.request.query_params.get("q") or "").strip()
        if category_id.isdigit():
            queryset = queryset.filter(category_id=int(category_id))
        if query:
            queryset = queryset.filter(Q(name__icontains=query) | Q(code__icontains=query))
        return queryset.order_by("category__path", "sort_order", "name", "id")
