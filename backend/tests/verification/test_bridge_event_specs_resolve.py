"""Guard: every accounting bridge-readiness event spec must reference a real model.

The subscriptions split relocated several source models between apps (Payment,
Subscription, Commission, RentLeaseBillingDemand, ...). When a `BridgeEventSpec`
still names the old `source_app`, `_source_model_exists` used to return False and
the event silently disappeared from the operator's bridge-readiness view — a
go-live readiness accuracy bug with no test to catch it. This walks every spec in
every registry and asserts its source model resolves somewhere.
"""
from django.apps import apps
from django.test import TestCase

from accounting.services import accounting_bridge_readiness_service as base
from accounting.services import commission_payout_bridge_readiness_service as commission
from accounting.services import inventory_manufacturing_bridge_readiness_service as invmfg
from accounting.services import returns_damage_credit_bridge_readiness_service as rdc


def _iter_specs():
    for module in (base, commission, invmfg, rdc):
        for attr in vars(module).values():
            if isinstance(attr, tuple) and attr and hasattr(attr[0], "source_model"):
                yield from attr


def _model_exists_anywhere(model_name: str) -> bool:
    return any(model.__name__ == model_name for model in apps.get_models())


class BridgeEventSpecResolutionTest(TestCase):
    def test_every_spec_source_model_resolves(self):
        unresolved = [
            (spec.event_key, spec.source_app, spec.source_model)
            for spec in _iter_specs()
            if not _model_exists_anywhere(spec.source_model)
        ]
        self.assertEqual(
            unresolved,
            [],
            f"BridgeEventSpec entries reference models that exist in no app: {unresolved}",
        )
