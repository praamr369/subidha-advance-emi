"""Backward-compat shim (Phase D). The KYC-workflow enums/helpers already live in
customers.models (customers absorbed KYC in a prior split); re-export from there."""
from customers.models import (  # noqa: F401
    KycOwnerType,
    KycUploadSource,
    KycReviewActionType,
    PartnerKycDocumentStatus,
    PartnerKycDocumentType,
    partner_kyc_doc_upload_to,
)
