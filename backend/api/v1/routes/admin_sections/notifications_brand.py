from django.urls import include, path
from api.v1.views.admin_brand_data import AdminBrandDataApplyView
from api.v1.views.admin_brand_data import AdminBrandDataAuditView
from api.v1.views.admin_brand_data import AdminBrandDataGoogleBusinessPreviewView
from api.v1.views.admin_brand_data import AdminBrandDataManualPreviewView
from api.v1.views.admin_brand_data import AdminBrandDataSocialLinkActionView
from api.v1.views.admin_brand_data import AdminBrandDataSourcesView
from api.v1.views.admin_brand_data import AdminBrandDataYoutubePreviewView
from api.v1.views.admin_brand_data import AdminBrandDirectProfileView
from api.v1.views.admin_outstandings import AdminOutstandingsExportCsvView
from api.v1.views.admin_outstandings import AdminOutstandingsView
from api.v1.views.notifications import AdminNotificationArchiveView
from api.v1.views.notifications import AdminNotificationDismissAllView
from api.v1.views.notifications import AdminNotificationListView
from api.v1.views.notifications import AdminNotificationMarkReadView
from api.v1.views.notifications import AdminUnreadNotificationCountView

urlpatterns = [
    path("notifications/", AdminNotificationListView.as_view()),
    path("notifications/unread-count/", AdminUnreadNotificationCountView.as_view()),
    path("notifications/<int:pk>/read/", AdminNotificationMarkReadView.as_view()),
    path("notifications/<int:pk>/archive/", AdminNotificationArchiveView.as_view()),
    path("notifications/dismiss-all/", AdminNotificationDismissAllView.as_view()),
    path("outstandings/", AdminOutstandingsView.as_view()),
    path("outstandings/export.csv", AdminOutstandingsExportCsvView.as_view()),
    path("brand-data/sources/", AdminBrandDataSourcesView.as_view()),
    path("brand-data/import/manual/preview/", AdminBrandDataManualPreviewView.as_view()),
    path("brand-data/import/google-business/preview/", AdminBrandDataGoogleBusinessPreviewView.as_view()),
    path("brand-data/import/youtube/preview/", AdminBrandDataYoutubePreviewView.as_view()),
    path("brand-data/import/social-link/", AdminBrandDataSocialLinkActionView.as_view()),
    path("brand-data/apply/", AdminBrandDataApplyView.as_view()),
    path("brand-data/audit/", AdminBrandDataAuditView.as_view()),
    path("brand-data/profile/", AdminBrandDirectProfileView.as_view()),
]
