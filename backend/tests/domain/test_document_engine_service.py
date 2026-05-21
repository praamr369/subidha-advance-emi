from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone

from billing.models import BillingDocumentStatus, ReceiptDocument, ReceiptType
from subscriptions.models import SubscriptionDocument, SubscriptionDocumentType
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_customer_user,
    create_lucky_id,
    create_partner_user,
    create_product,
    create_subscription,
)


class DocumentEngineServiceTests(TestCase):
    def test_receipt_document_meta_contract_is_stable(self):
        from subscriptions.services.document_engine_service import (
            receipt_to_document_meta,
            resolve_document_source,
        )

        admin = create_admin_user(username="doc_admin", phone="9000000091")
        customer = create_customer_profile(name="Doc Customer", phone="9000000092")
        partner = create_partner_user(username="doc_partner", phone="9000000093")
        product = create_product(base_price=Decimal("12000.00"), product_code="DOC-P1")
        batch = create_batch()
        lucky_id = create_lucky_id(batch=batch, lucky_number=11)
        subscription = create_subscription(
            customer=customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
            partner=partner,
            total_amount=Decimal("12000.00"),
            monthly_amount=Decimal("1000.00"),
        )

        receipt = ReceiptDocument.objects.create(
            receipt_no="RCT-TEST-0001",
            receipt_type=ReceiptType.EMI_PAYMENT_RECEIPT,
            status=BillingDocumentStatus.DRAFT,
            receipt_date=timezone.localdate(),
            amount=Decimal("1000.00"),
            customer=customer,
            subscription=subscription,
            source_reference="SUB-REF-1",
        )

        meta = receipt_to_document_meta(receipt=receipt).to_dict()
        self.assertEqual(meta["document_type"], "MONEY_RECEIPT_PDF")
        self.assertEqual(meta["document_number"], "RCT-TEST-0001")
        self.assertEqual(meta["source_model"], "billing.ReceiptDocument")
        self.assertEqual(meta["source_object_id"], receipt.id)
        self.assertEqual(meta["customer_id"], customer.id)
        self.assertEqual(meta["status"], BillingDocumentStatus.DRAFT)
        self.assertEqual(meta["metadata"]["subscription_id"], subscription.id)

        resolved = resolve_document_source(source_model="billing.ReceiptDocument", source_object_id=receipt.id)
        self.assertEqual(resolved.id, receipt.id)

    def test_subscription_document_meta_contract_is_stable(self):
        from subscriptions.services.document_engine_service import subscription_document_to_document_meta

        admin = create_admin_user(username="doc_admin2", phone="9000000094")
        customer = create_customer_profile(name="Doc Customer 2", phone="9000000095")
        partner = create_partner_user(username="doc_partner2", phone="9000000096")
        product = create_product(base_price=Decimal("9000.00"), product_code="DOC-P2")
        batch = create_batch()
        lucky_id = create_lucky_id(batch=batch, lucky_number=12)
        subscription = create_subscription(
            customer=customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
            partner=partner,
            total_amount=Decimal("9000.00"),
            monthly_amount=Decimal("1000.00"),
        )

        upload = SimpleUploadedFile("contract.pdf", b"test-pdf", content_type="application/pdf")
        doc = SubscriptionDocument.objects.create(
            subscription=subscription,
            document_type=SubscriptionDocumentType.ADVANCE_EMI_CONTRACT_PDF,
            file=upload,
            generated_by=admin,
        )

        meta = subscription_document_to_document_meta(doc=doc).to_dict()
        self.assertEqual(meta["document_type"], SubscriptionDocumentType.ADVANCE_EMI_CONTRACT_PDF)
        self.assertEqual(meta["source_model"], "subscriptions.SubscriptionDocument")
        self.assertEqual(meta["source_object_id"], doc.id)
        self.assertEqual(meta["customer_id"], customer.id)
        self.assertEqual(meta["generated_by_user_id"], admin.id)
        self.assertTrue(meta["checksum_sha256"])
        self.assertEqual(meta["metadata"]["subscription_id"], subscription.id)

    def test_permission_helpers_do_not_leak_across_roles(self):
        from subscriptions.services.document_engine_service import (
            user_can_view_receipt,
            user_can_view_subscription_document,
        )

        admin = create_admin_user(username="doc_admin3", phone="9000000097")
        customer_user = create_customer_user(username="doc_customer_user", phone="9000000098")
        customer = create_customer_profile(user=customer_user, name="Doc Customer 3", phone="9000000098")
        other_customer = create_customer_profile(name="Other Customer", phone="9000000099")

        partner = create_partner_user(username="doc_partner3", phone="9000000100")
        product = create_product(base_price=Decimal("6000.00"), product_code="DOC-P3")
        batch = create_batch()
        lucky_id = create_lucky_id(batch=batch, lucky_number=13)
        subscription = create_subscription(
            customer=customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
            partner=partner,
            total_amount=Decimal("6000.00"),
            monthly_amount=Decimal("1000.00"),
        )
        other_subscription = create_subscription(
            customer=other_customer,
            product=product,
            batch=batch,
            lucky_id=create_lucky_id(batch=batch, lucky_number=14),
            partner=partner,
            total_amount=Decimal("6000.00"),
            monthly_amount=Decimal("1000.00"),
        )

        receipt = ReceiptDocument.objects.create(
            receipt_type=ReceiptType.EMI_PAYMENT_RECEIPT,
            status=BillingDocumentStatus.DRAFT,
            receipt_date=timezone.localdate(),
            amount=Decimal("1000.00"),
            customer=customer,
            subscription=subscription,
        )
        other_receipt = ReceiptDocument.objects.create(
            receipt_type=ReceiptType.EMI_PAYMENT_RECEIPT,
            status=BillingDocumentStatus.DRAFT,
            receipt_date=timezone.localdate(),
            amount=Decimal("1000.00"),
            customer=other_customer,
            subscription=other_subscription,
        )

        upload = SimpleUploadedFile("contract.pdf", b"test-pdf", content_type="application/pdf")
        doc = SubscriptionDocument.objects.create(
            subscription=subscription,
            document_type=SubscriptionDocumentType.ADVANCE_EMI_CONTRACT_PDF,
            file=upload,
        )
        other_doc = SubscriptionDocument.objects.create(
            subscription=other_subscription,
            document_type=SubscriptionDocumentType.ADVANCE_EMI_CONTRACT_PDF,
            file=SimpleUploadedFile("contract2.pdf", b"test-pdf2", content_type="application/pdf"),
        )

        self.assertTrue(user_can_view_receipt(user=admin, receipt=receipt))
        self.assertTrue(user_can_view_receipt(user=customer_user, receipt=receipt))
        self.assertFalse(user_can_view_receipt(user=customer_user, receipt=other_receipt))

        self.assertTrue(user_can_view_subscription_document(user=admin, doc=doc))
        self.assertTrue(user_can_view_subscription_document(user=customer_user, doc=doc))
        self.assertFalse(user_can_view_subscription_document(user=customer_user, doc=other_doc))

