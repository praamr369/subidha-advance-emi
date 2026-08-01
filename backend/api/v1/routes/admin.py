from django.urls import include, path
from rest_framework.routers import DefaultRouter
from api.v1.views.admin_opening_stock import AdminOpeningStockEntryViewSet
from api.v1.views.admin_resources import BatchAdminViewSet
from api.v1.views.admin_resources import CustomerAdminViewSet
from api.v1.views.admin_resources import EmiAdminViewSet
from api.v1.views.admin_resources import LuckyDrawAdminViewSet
from api.v1.views.admin_resources import LuckyIdAdminViewSet
from api.v1.views.admin_resources import PartnerAdminListViewSet
from api.v1.views.admin_resources import PaymentAdminViewSet
from api.v1.views.admin_resources import ProductAdminViewSet
from api.v1.views.admin_resources import ProductCategoryMasterViewSet
from api.v1.views.admin_resources import ProductSubcategoryMasterViewSet
from api.v1.views.admin_resources import ProductUnitOfMeasureMasterViewSet
from api.v1.views.admin_resources import RentalAssetAdminViewSet
from api.v1.views.paginated_registers import PaginatedSubscriptionAdminViewSet
from api.v1.views.vendor_ops import AdminVendorCategoryViewSet
from api.v1.views.vendor_ops import AdminVendorViewSet

from api.v1.routes import crm_workbench as workbench_routes
from api.v1.routes import online_request as online_request_routes
from api.v1.routes.admin_sections import (
    contracts_receivables,
    business_setup,
    dashboard_deliveries,
    requests_support,
    finance_ops,
    billing_documents,
    accounting_operations,
    reports_compliance,
    crm_inventory,
    bi_hr,
    notifications_brand,
    reversal_returns,
    settlements,
    kyc,
    finance_misc,
)

router = DefaultRouter()
router.register(r"batches", BatchAdminViewSet, basename="admin-batches")
router.register(r"customers", CustomerAdminViewSet, basename="admin-customers")
router.register(r"emis", EmiAdminViewSet, basename="admin-emis")
router.register(r"lucky-draws", LuckyDrawAdminViewSet, basename="admin-lucky-draws")
router.register(r"lucky-ids", LuckyIdAdminViewSet, basename="admin-lucky-ids")
router.register(r"partners", PartnerAdminListViewSet, basename="admin-partners")
router.register(r"payments", PaymentAdminViewSet, basename="admin-payments")
router.register(r"products", ProductAdminViewSet, basename="admin-products")
router.register(r"product-categories", ProductCategoryMasterViewSet, basename="admin-product-categories")
router.register(r"product-subcategories", ProductSubcategoryMasterViewSet, basename="admin-product-subcategories")
router.register(r"product-units", ProductUnitOfMeasureMasterViewSet, basename="admin-product-units")
router.register(r"rental-assets", RentalAssetAdminViewSet, basename="admin-rental-assets")
router.register(r"vendors", AdminVendorViewSet, basename="admin-vendors")
router.register(r"vendors/categories", AdminVendorCategoryViewSet, basename="admin-vendor-categories")
router.register(r"subscriptions", PaginatedSubscriptionAdminViewSet, basename="admin-subscriptions")
router.register(
    r"inventory/opening-stock",
    AdminOpeningStockEntryViewSet,
    basename="admin-opening-stock",
)

urlpatterns = (
    contracts_receivables.urlpatterns
    + business_setup.urlpatterns
    + dashboard_deliveries.urlpatterns
    + requests_support.urlpatterns
    + finance_ops.urlpatterns
    + billing_documents.urlpatterns
    + accounting_operations.urlpatterns
    + reports_compliance.urlpatterns
    + crm_inventory.urlpatterns
    + bi_hr.urlpatterns
    + notifications_brand.urlpatterns
    + reversal_returns.urlpatterns
    + settlements.urlpatterns
    + [path("", include(router.urls))]
    + kyc.urlpatterns
    + finance_misc.urlpatterns
) + workbench_routes.urlpatterns + online_request_routes.urlpatterns
