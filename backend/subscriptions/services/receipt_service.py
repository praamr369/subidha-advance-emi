from hashlib import sha256


def generate_receipt_no(payment):
    """
    Deterministic receipt number.
    Does NOT require a DB field.
    """

    raw = f"{payment.id}:{payment.payment_date}:{payment.amount}"
    return "RCP-" + sha256(raw.encode()).hexdigest()[:12].upper()