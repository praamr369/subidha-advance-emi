"""Backward-compat shim.

The growth-offer models moved to the ``growth`` app (Phase A of the
subscriptions split). This module re-exports them so existing
``from subscriptions.models_growth_offers import ...`` imports keep working.
Import migration to ``from growth.models import ...`` is deferred to Phase H.
"""
from growth.models import (  # noqa: F401
    GrowthTimeStampedModel,
    PlanTemplateType,
    PlanTemplate,
    OfferPackageStatus,
    OfferAudienceType,
    OfferPackage,
    OfferDiscountType,
    OfferPackageLine,
)
