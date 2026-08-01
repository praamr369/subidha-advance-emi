class CustomerRiskBand(models.TextChoices):
    LOW = "LOW", "Low Risk"
    MEDIUM = "MEDIUM", "Medium Risk"
    HIGH = "HIGH", "High Risk"
    BLOCKED = "BLOCKED", "Blocked"

class DisputeType(models.TextChoices):
    PAYMENT_DISPUTE = "PAYMENT_DISPUTE", "Payment Dispute"
    DELIVERY_DISPUTE = "DELIVERY_DISPUTE", "Delivery Dispute"
    PRODUCT_DEFECT = "PRODUCT_DEFECT", "Product Defect"
    BILLING_ERROR = "BILLING_ERROR", "Billing Error"
    KYC_ISSUE = "KYC_ISSUE", "KYC Issue"
    OTHER = "OTHER", "Other"

class DisputeStage(models.TextChoices):
    OPEN = "OPEN", "Open"
    UNDER_REVIEW = "UNDER_REVIEW", "Under Review"
    RESOLVED = "RESOLVED", "Resolved"
    REJECTED = "REJECTED", "Rejected"
    ESCALATED = "ESCALATED", "Escalated"

PIN_VALIDATOR = RegexValidator(
    regex=r'^\d{6}$',
    message='PIN must be exactly 6 digits',
    code='invalid_pin'
)

class KycOwnerType(models.TextChoices):
    CUSTOMER = "CUSTOMER", "Customer"
    PARTNER = "PARTNER", "Partner"
    VENDOR = "VENDOR", "Vendor"
    STAFF = "STAFF", "Staff"

class KycUploadSource(models.TextChoices):
    ADMIN_UPLOAD = "ADMIN_UPLOAD", "Admin Upload"
    SELF_SERVICE_UPLOAD = "SELF_SERVICE_UPLOAD", "Self-Service Upload"
    CRM_UPLOAD = "CRM_UPLOAD", "CRM Upload"
    SUBSCRIPTION_REGISTRATION = "SUBSCRIPTION_REGISTRATION", "Subscription Registration"

class KycReviewActionType(models.TextChoices):
    SUBMIT = "SUBMIT", "Submitted for Review"
    APPROVE = "APPROVE", "Approved"
    REJECT = "REJECT", "Rejected"
    REQUEST_RESUBMISSION = "REQUEST_RESUBMISSION", "Resubmission Requested"
    EXCEPTION_APPROVE = "EXCEPTION_APPROVE", "Exception Approved (Admin Override)"
    EXPIRE = "EXPIRE", "Expired"
    UPLOAD = "UPLOAD", "Document Uploaded"

