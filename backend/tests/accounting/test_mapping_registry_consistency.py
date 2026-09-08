"""The two mapping registries must stay in lockstep.

Adding a purpose to ``DEFAULT_MAPPINGS`` silently makes it REQUIRED, because
``REQUIRED_MAPPING_PURPOSES`` is derived from it. But mappings are actually
created by ``apply_accounting_setup_defaults``, which walks a *different* table:
``PURPOSE_TO_TARGET_CHART_KEY``.

Update one and not the other and you get a purpose that is mandatory but
uncreatable — every environment lands in permanent NEEDS_ATTENTION with a
blocker no operator action can clear. That is exactly what happened when
RENTAL_ASSET_IN_SERVICE was added, and it only surfaced in the full suite.

These tests fail loudly at the source instead.
"""
from __future__ import annotations

from django.test import SimpleTestCase

from accounting.services.accounting_setup_catalog import (
    CANONICAL_CHART_ACCOUNT_BY_KEY,
)
from accounting.services.accounting_setup_service import (
    DEFAULT_MAPPINGS,
    REQUIRED_MAPPING_PURPOSES,
)
from accounting.services.setup_defaults_service import PURPOSE_TO_TARGET_CHART_KEY


class MappingRegistryConsistencyTests(SimpleTestCase):
    def test_every_required_purpose_can_actually_be_created(self):
        """Required purposes must have a chart-key target the defaults path knows."""
        creatable = set(PURPOSE_TO_TARGET_CHART_KEY)
        uncreatable = sorted(set(REQUIRED_MAPPING_PURPOSES) - creatable)
        self.assertEqual(
            uncreatable,
            [],
            msg=(
                "These purposes are REQUIRED (they appear in DEFAULT_MAPPINGS) but "
                "apply_accounting_setup_defaults cannot create them, because they are "
                "missing from PURPOSE_TO_TARGET_CHART_KEY in setup_defaults_service. "
                "Add them there, or remove them from DEFAULT_MAPPINGS."
            ),
        )

    def test_every_target_chart_key_is_a_real_canonical_account(self):
        """A target key with no canonical account behind it can never resolve."""
        unknown = sorted(
            key
            for key in PURPOSE_TO_TARGET_CHART_KEY.values()
            if key not in CANONICAL_CHART_ACCOUNT_BY_KEY
        )
        self.assertEqual(
            unknown,
            [],
            msg=(
                "PURPOSE_TO_TARGET_CHART_KEY points at chart-account keys that are not "
                "declared in the canonical catalog, so no account will ever be found."
            ),
        )

    def test_default_mapping_chart_names_match_canonical_account_names(self):
        """DEFAULT_MAPPINGS resolves the chart account by NAME, so names must match.

        create_default_mappings does ChartOfAccount.objects.filter(name__iexact=...).
        A typo or a renamed canonical account silently skips the mapping as
        'skipped_missing_prerequisite' rather than failing.
        """
        canonical_names = {
            spec.name.strip().lower() for spec in CANONICAL_CHART_ACCOUNT_BY_KEY.values()
        }
        unmatched = sorted(
            {
                chart_name
                for _finance, chart_name, _purpose, _default in DEFAULT_MAPPINGS
                if chart_name.strip().lower() not in canonical_names
            }
        )
        self.assertEqual(
            unmatched,
            [],
            msg=(
                "DEFAULT_MAPPINGS references chart account names that do not exist in "
                "the canonical catalog. create_default_mappings matches on name, so "
                "these mappings are silently skipped."
            ),
        )

    def test_rental_asset_in_service_is_wired_through_both_registries(self):
        """Regression guard for the specific purpose that broke."""
        from accounting.models import FinanceAccountMappingPurpose

        purpose = FinanceAccountMappingPurpose.RENTAL_ASSET_IN_SERVICE
        self.assertIn(purpose, REQUIRED_MAPPING_PURPOSES)
        self.assertIn(purpose, PURPOSE_TO_TARGET_CHART_KEY)
        self.assertIn("RENTAL_ASSET_IN_SERVICE", CANONICAL_CHART_ACCOUNT_BY_KEY)
