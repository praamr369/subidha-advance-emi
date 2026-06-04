from django.urls import path

from api.v1.views.staff_portal import AdminStaffIdentityDetailView, AdminStaffIdentityListCreateView

urlpatterns = [
    path("staff-identities/", AdminStaffIdentityListCreateView.as_view(), name="admin-staff-identities"),
    path("staff-identities/<int:pk>/", AdminStaffIdentityDetailView.as_view(), name="admin-staff-identity-detail"),
]
