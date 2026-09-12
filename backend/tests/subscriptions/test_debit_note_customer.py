"""Debit note → customer resolution (via the original invoice).

``BillingDebitNoteSerializer.customer_id`` lets the debit-note register show the
customer's per-product money position. A debit note has no customer column; it
reaches the customer through its original invoice. This is a unit test of the
resolver only (no DB rows), so it pins the lookup logic, not the full API.
"""
from types import SimpleNamespace

from django.test import SimpleTestCase

from api.v1.serializers.billing import BillingCreditNoteSerializer, BillingDebitNoteSerializer


class DebitNoteCustomerResolutionTests(SimpleTestCase):
    def setUp(self):
        self.serializer = BillingDebitNoteSerializer()

    def test_customer_comes_from_the_original_invoice(self):
        note = SimpleNamespace(original_invoice=SimpleNamespace(customer_id=42))

        self.assertEqual(self.serializer.get_customer_id(note), 42)

    def test_invoice_without_customer_resolves_none(self):
        note = SimpleNamespace(original_invoice=SimpleNamespace(customer_id=None))

        self.assertIsNone(self.serializer.get_customer_id(note))

    def test_note_without_invoice_resolves_none(self):
        note = SimpleNamespace(original_invoice=None)

        self.assertIsNone(self.serializer.get_customer_id(note))


class CreditNoteCustomerResolutionTests(SimpleTestCase):
    """Same resolution for credit notes — the credit-note register's column."""

    def setUp(self):
        self.serializer = BillingCreditNoteSerializer()

    def test_customer_comes_from_the_original_invoice(self):
        note = SimpleNamespace(original_invoice=SimpleNamespace(customer_id=7))

        self.assertEqual(self.serializer.get_customer_id(note), 7)

    def test_invoice_without_customer_resolves_none(self):
        note = SimpleNamespace(original_invoice=SimpleNamespace(customer_id=None))

        self.assertIsNone(self.serializer.get_customer_id(note))

    def test_note_without_invoice_resolves_none(self):
        note = SimpleNamespace(original_invoice=None)

        self.assertIsNone(self.serializer.get_customer_id(note))
