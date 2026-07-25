from django.urls import path
from api.v1.views.admin_smart_collection import AdminSmartCollectionView, AdminSmartCollectionOutstandingView

urlpatterns = [
    path("billing/smart-collect/", AdminSmartCollectionView.as_view(), name="admin_smart_collection"),
    path("billing/smart-collect/outstanding/", AdminSmartCollectionOutstandingView.as_view(), name="admin_smart_collection_outstanding"),
]
