class PartnerCustomerKycRequestType(models.TextChoices):
    KYC_UPGRADE = "KYC_UPGRADE", "KYC Verification Request"
    LOGIN_ID_SETUP = "LOGIN_ID_SETUP", "Login ID Setup Request"
    KYC_DOCUMENT_UPLOAD = "KYC_DOCUMENT_UPLOAD", "KYC Document Upload Request"