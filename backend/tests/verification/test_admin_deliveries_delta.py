"""Layer-C delta: delivery transitions specify a target + failures carry a reason.

The delivery lifecycle is a state machine (transition / mark-delivered / mark-failed
/ cancel / request-return / mark-returned); each action get_object_or_404's the
delivery, validates its serializer, and delegates to a delivery service. This locks
two input invariants: a status transition must name the target status, and a
failure must document a reason (both pure-serializer, no fixtures).
"""
from django.test import SimpleTestCase

from api.v1.views.admin_deliveries import (
    AdminSubscriptionDeliveryReasonSerializer,
    AdminSubscriptionDeliveryTransitionSerializer,
)


class AdminDeliveriesDeltaTest(SimpleTestCase):
    def test_transition_requires_target_status(self):
        self.assertTrue(AdminSubscriptionDeliveryTransitionSerializer().fields["status"].required)

    def test_failure_requires_reason(self):
        self.assertTrue(AdminSubscriptionDeliveryReasonSerializer().fields["reason"].required)
