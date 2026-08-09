class KycDocumentCategory(models.TextChoices):
    """
    Additive readiness category for customer KYC documents.

    Lets an uploaded document be classified into the readiness buckets used by
    the contract KYC gate (ID proof, address proof, etc.) without rewriting the
    existing document_type storage. When left UNSPECIFIED the readiness service
    infers a category from ``document_type`` (e.g. AADHAAR -> ID/address proof).
    """

    UNSPECIFIED = "UNSPECIFIED", "Unspecified"
    ID_PROOF = "ID_PROOF", "Identity Proof"
    ADDRESS_PROOF = "ADDRESS_PROOF", "Address Proof"
    CUSTOMER_PHOTO = "CUSTOMER_PHOTO", "Customer Photo"
    PHONE_VERIFICATION = "PHONE_VERIFICATION", "Phone Verification"
    DELIVERY_ADDRESS_PROOF = "DELIVERY_ADDRESS_PROOF", "Delivery Address Proof"
    GUARANTOR_ID_PROOF = "GUARANTOR_ID_PROOF", "Guarantor Identity Proof"
    GUARANTOR_ADDRESS_PROOF = "GUARANTOR_ADDRESS_PROOF", "Guarantor Address Proof"
    OTHER = "OTHER", "Other"