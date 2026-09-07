"""The four policy decisions, once they were decisions rather than guesses.

Each of these was held back from earlier work because building it meant
inventing a business rule: what deduction a damaged return carries, whether a
waiver needs approval, whether a purge deletes, and which draw verification is
authoritative. The rules were set on 2026-09-07; these pin what was built from
them, and — more importantly — the refusals, since every one of these endpoints
either moves money or destroys data.
"""
from decimal import Decimal

from django.test import SimpleTestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.enums import DAMAGE_DEDUCTION_PERCENT, DamageGrade


class DamageBandTests(SimpleTestCase):
    """The published table. No database needed — it is policy, not data."""

    def test_every_grade_has_a_band(self):
        """A grade with no percentage would compute a deduction of None."""
        for grade in DamageGrade:
            self.assertIn(grade, DAMAGE_DEDUCTION_PERCENT)

    def test_the_bands_are_the_ones_that_were_agreed(self):
        """Pinned deliberately: this is the number a customer is charged.

        Changing a band is a business decision, and it should have to change a
        test that says so out loud rather than slipping through as a tweak.
        """
        self.assertEqual(DAMAGE_DEDUCTION_PERCENT[DamageGrade.GOOD], Decimal("0"))
        self.assertEqual(DAMAGE_DEDUCTION_PERCENT[DamageGrade.MINOR], Decimal("10"))
        self.assertEqual(DAMAGE_DEDUCTION_PERCENT[DamageGrade.MAJOR], Decimal("25"))
        self.assertEqual(DAMAGE_DEDUCTION_PERCENT[DamageGrade.SEVERE], Decimal("50"))

    def test_good_condition_never_withholds_money(self):
        self.assertEqual(DAMAGE_DEDUCTION_PERCENT[DamageGrade.GOOD], Decimal("0"))

    def test_no_band_takes_more_than_half(self):
        """A ceiling, not an accident.

        A deduction approaching the full amount stops being a damage charge and
        becomes a forfeiture, which is a different thing legally and needs its
        own decision rather than arriving via a band edit.
        """
        for grade, percent in DAMAGE_DEDUCTION_PERCENT.items():
            self.assertLessEqual(percent, Decimal("50"), f"{grade} exceeds 50%")


class PublicSeedVerificationTests(APITestCase):
    """The public half of the draw's defensibility."""

    URL = "/api/v1/public/lucky-plan/verify-seed/"

    def test_a_correct_seed_verifies_without_logging_in(self):
        """Unauthenticated by design — see the view's docstring."""
        import hashlib

        seed = "a-known-seed-value"
        digest = hashlib.sha256(seed.encode()).hexdigest()

        response = self.client.post(
            self.URL, {"reveal_seed": seed, "commit_hash": digest}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["valid"])
        self.assertEqual(response.data["computed_hash"], digest)

    def test_a_wrong_seed_does_not_verify(self):
        response = self.client.post(
            self.URL,
            {"reveal_seed": "not-the-seed", "commit_hash": "0" * 64},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["valid"])

    def test_surrounding_whitespace_does_not_break_a_genuine_seed(self):
        """The commit hashed seed.strip(); verification must match exactly.

        A seed pasted from an email arrives with a trailing newline. If that
        made a real seed fail, the endpoint would manufacture false accusations
        of tampering.
        """
        import hashlib

        seed = "seed-with-spaces"
        digest = hashlib.sha256(seed.encode()).hexdigest()

        response = self.client.post(
            self.URL,
            {"reveal_seed": f"  {seed}\n", "commit_hash": digest},
            format="json",
        )
        self.assertTrue(response.data["valid"])

    def test_a_missing_seed_is_refused(self):
        response = self.client.post(self.URL, {"commit_hash": "x" * 64}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_neither_a_batch_nor_a_hash_is_refused(self):
        """Comparing a seed against nothing would always answer 'valid'."""
        response = self.client.post(self.URL, {"reveal_seed": "anything"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_an_unknown_batch_is_a_404_not_a_false_negative(self):
        """Reporting 'not valid' for a batch that does not exist would read as
        evidence of tampering rather than a lookup miss."""
        response = self.client.post(
            self.URL,
            {"reveal_seed": "anything", "batch_id": 99999},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
