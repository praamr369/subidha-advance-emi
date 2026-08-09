"""Layer-C delta: contract amendment rejection documents a reason.

Contract lifecycle (approve/activate/cancel/close) and amendments (review/approve/
reject/apply/implement) are IsAdmin state machines that delegate to the contract
services and 404-guard their targets. A rejection must record why — this locks that
ContractAmendmentRejectSerializer requires rejection_reason (pure serializer, no
fixtures).
"""
from django.test import SimpleTestCase

from api.v1.serializers.contract_amendments import ContractAmendmentRejectSerializer


class AdminContractsDeltaTest(SimpleTestCase):
    def test_amendment_rejection_requires_reason(self):
        self.assertTrue(
            ContractAmendmentRejectSerializer().fields["rejection_reason"].required
        )
