from decimal import Decimal

from django.test import TestCase

from smart_fields.models import (
    FieldSuggestionMapping,
    HsnCode,
    PincodeLocation,
    SmartFieldSource,
)
from smart_fields.services import suggestion_service as svc


class PincodeLookupTests(TestCase):
    def test_single_match_returns_primary(self):
        PincodeLocation.objects.create(
            pincode="560034",
            city="Bengaluru",
            district="Bengaluru Urban",
            state="Karnataka",
            state_code="29",
        )
        result = svc.lookup_pincode("560034")
        self.assertEqual(result["primary"]["city"], "Bengaluru")
        self.assertEqual(len(result["options"]), 1)

    def test_multiple_matches_returned_as_options(self):
        PincodeLocation.objects.create(pincode="123456", city="A", state="S1")
        PincodeLocation.objects.create(pincode="123456", city="B", state="S2")
        result = svc.lookup_pincode("123456")
        self.assertEqual(len(result["options"]), 2)

    def test_invalid_pincode_returns_empty(self):
        result = svc.lookup_pincode("12")
        self.assertEqual(result["options"], [])
        self.assertIsNone(result["primary"])

    def test_confirmation_creates_pincode_row(self):
        svc.record_confirmation(
            field_key="pincode",
            input_text="400001",
            value="Mumbai|Mumbai|Maharashtra|27",
        )
        self.assertTrue(
            PincodeLocation.objects.filter(pincode="400001", city="Mumbai").exists()
        )


class HsnSuggestionTests(TestCase):
    def setUp(self):
        HsnCode.objects.create(
            code="8450",
            description="Washing machines",
            gst_rate=Decimal("18"),
            keywords="washing machine washer fully automatic",
        )
        HsnCode.objects.create(
            code="8415",
            description="Air conditioners",
            gst_rate=Decimal("28"),
            keywords="air conditioner ac split window",
        )

    def test_heuristic_ranks_relevant_code_first(self):
        results = svc.suggest_hsn("LG fully automatic washing machine")
        self.assertTrue(results)
        self.assertEqual(results[0]["code"], "8450")
        self.assertEqual(results[0]["source"], "HEURISTIC")

    def test_empty_text_returns_no_results(self):
        self.assertEqual(svc.suggest_hsn(""), [])

    def test_learned_mapping_beats_heuristic(self):
        svc.record_confirmation(
            field_key=svc.FIELD_HSN,
            input_text="LG fully automatic washing machine",
            value="8450",
            label="Washing machines",
            gst_rate="18",
        )
        results = svc.suggest_hsn("LG fully automatic washing machine")
        self.assertEqual(results[0]["code"], "8450")
        self.assertEqual(results[0]["source"], "LEARNED")
        self.assertGreaterEqual(results[0]["confidence"], 0.95)

    def test_confirmation_increments_hit_count(self):
        for _ in range(2):
            svc.record_confirmation(
                field_key=svc.FIELD_HSN,
                input_text="ceiling fan",
                value="8414",
            )
        mapping = FieldSuggestionMapping.objects.get(
            field_key=svc.FIELD_HSN, input_normalized="ceiling fan"
        )
        self.assertEqual(mapping.hit_count, 2)
        self.assertEqual(mapping.source, SmartFieldSource.CONFIRMED)
