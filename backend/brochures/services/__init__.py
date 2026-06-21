from .brochure_crm_link_service import link_brochure_enquiry_to_crm
from .brochure_enquiry_duplicate_service import (
    mark_possible_duplicate,
    normalize_phone_for_comparison,
)
from .brochure_enquiry_lifecycle_service import (
    mark_enquiry_contacted,
    record_initial_enquiry_history,
    update_enquiry_follow_up,
)

__all__ = [
    "link_brochure_enquiry_to_crm",
    "mark_enquiry_contacted",
    "mark_possible_duplicate",
    "normalize_phone_for_comparison",
    "record_initial_enquiry_history",
    "update_enquiry_follow_up",
]
