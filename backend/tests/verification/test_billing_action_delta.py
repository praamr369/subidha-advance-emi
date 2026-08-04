"""Layer-C delta: billing action -> serializer routing.

The billing ViewSets (all IsAdmin-gated per Layer B) route each state-changing
@action to a specific serializer via get_serializer_class. This locks that
routing so a destructive action can't be silently downgraded to a serializer that
doesn't demand its key input (a cancel/void must always require a reason; a
collect must always require an amount).
"""
from django.test import SimpleTestCase

from api.v1.serializers.billing import (
    DirectSaleCollectionSerializer,
    DirectSaleConfirmSerializer,
    DirectSaleDeliveredSerializer,
    ReceiptVoidSerializer,
)
from api.v1.serializers.operational_cancellation import (
    OperationalCancellationActionSerializer,
)
from api.v1.views.billing import DirectSaleViewSet, ReceiptDocumentViewSet


def _serializer_for(viewset_cls, action):
    view = viewset_cls()
    view.action = action
    return view.get_serializer_class()


class BillingActionRoutingDeltaTest(SimpleTestCase):
    def test_direct_sale_actions_route_to_expected_serializers(self):
        self.assertIs(_serializer_for(DirectSaleViewSet, "confirm_sale"), DirectSaleConfirmSerializer)
        self.assertIs(_serializer_for(DirectSaleViewSet, "mark_delivered"), DirectSaleDeliveredSerializer)
        self.assertIs(_serializer_for(DirectSaleViewSet, "collect_payment"), DirectSaleCollectionSerializer)
        self.assertIs(_serializer_for(DirectSaleViewSet, "cancel_sale"), OperationalCancellationActionSerializer)

    def test_receipt_destructive_actions_require_reason_serializer(self):
        self.assertIs(_serializer_for(ReceiptDocumentViewSet, "void_document"), ReceiptVoidSerializer)
        self.assertIs(_serializer_for(ReceiptDocumentViewSet, "reverse_document"), ReceiptVoidSerializer)

    def test_key_inputs_are_required(self):
        # A collect must demand an amount; a cancel/void must demand a reason.
        self.assertTrue(DirectSaleCollectionSerializer().fields["amount"].required)
        self.assertTrue(ReceiptVoidSerializer().fields["reason"].required)
        self.assertTrue(OperationalCancellationActionSerializer().fields["reason"].required)
