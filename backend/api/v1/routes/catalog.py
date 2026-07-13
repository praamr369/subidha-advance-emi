from rest_framework.routers import DefaultRouter

from catalog.views import AttributeDefinitionViewSet, CatalogCategoryViewSet

router = DefaultRouter()
router.register(r"categories", CatalogCategoryViewSet, basename="catalog-category")
router.register(r"attribute-definitions", AttributeDefinitionViewSet, basename="catalog-attribute-definition")

urlpatterns = router.urls
