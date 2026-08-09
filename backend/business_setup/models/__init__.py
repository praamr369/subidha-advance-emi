"""business_setup models package (Phase B of the subscriptions split).

core must be imported first — the satellite modules subclass/reference its
BusinessSetupTimeStampedModel and models.
"""
from business_setup.models.core import *  # noqa: F401,F403
from business_setup.models.policy_governance import *  # noqa: F401,F403
from business_setup.models.compliance_review import *  # noqa: F401,F403
from business_setup.models.print_settings import *  # noqa: F401,F403
from business_setup.models.email_smtp import *  # noqa: F401,F403
from business_setup.models.dry_run import *  # noqa: F401,F403
