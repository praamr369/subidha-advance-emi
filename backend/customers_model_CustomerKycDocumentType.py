class CustomerKycDocumentType(models.TextChoices):
    AADHAAR = "AADHAAR", "Aadhaar Card"
    PAN = "PAN", "PAN Card"
    PASSPORT = "PASSPORT", "Passport"
    DRIVING_LICENSE = "DRIVING_LICENSE", "Driving License"
    VOTER_ID = "VOTER_ID", "Voter ID"
    OTHER = "OTHER", "Other"