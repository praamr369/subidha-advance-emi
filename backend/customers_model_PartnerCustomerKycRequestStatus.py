class PartnerCustomerKycRequestStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    MORE_INFO = "MORE_INFO", "More Information Needed"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"