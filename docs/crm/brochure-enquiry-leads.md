# Brochure Enquiry Leads

Brochure enquiries use CRM source `BROCHURE`.

## Linkage

- `BrochureEnquiry` is the source-of-truth record for the submitted brochure
  interest and frozen product snapshots.
- `PartyMaster` is matched by exact normalized phone before a new party is
  created.
- `PartyLink` connects the party to the brochure enquiry.
- `PartyInteraction` records the brochure number, selected plan, product names,
  location, and customer message.
- `Lead` is created with source `BROCHURE`, stage `NEW`, the first selected
  product where available, and the selected plan.

Each enquiry creates a distinct lead and interaction, while repeated enquiries
from the same phone reuse the existing party. CRM failures never roll back a
valid public enquiry; staff see the stored CRM sync warning in admin detail.

## Lifecycle

`NEW → CONTACTED → QUOTED → CONVERTED / CLOSED / LOST`

Marking a brochure enquiry contacted synchronizes the CRM lead to `CONTACTED`.
Marking it lost synchronizes the lead to `LOST`. Quote, customer, contract,
direct-sale, and subscription conversion are not automated in BROCHURE-2.

## Safety

CRM linkage creates lead-tracking records only. It does not create invoices,
receipts, payments, subscriptions, EMI schedules, accounting journals,
reconciliation entries, stock movements, reservations, or delivery records.

## BROCHURE-2A hardening

Party matching uses the enquiry's normalized phone. Indian 10-digit numbers are
compared consistently with `+91`, while the original public submission remains
stored separately.

CRM linking is safe to retry:

- an existing enquiry party, lead, or interaction is reused;
- `PartyInteraction` is unique in practice by brochure enquiry source;
- likely duplicate enquiries may reuse the earlier active CRM lead;
- each enquiry still records its own interaction;
- repeated service calls do not create duplicate CRM records.

CRM link states:

- `NOT_ATTEMPTED`: linkage has not run;
- `LINKED`: party, lead, and interaction are all linked;
- `PARTIAL`: some links exist but the operation did not finish;
- `SKIPPED`: linkage was intentionally not applicable;
- `FAILED`: no complete CRM link could be created; the enquiry remains valid.

Admin follow-up uses a guarded lifecycle:

`NEW → CONTACTED → QUOTED → CONVERTED`

`CLOSED` and `LOST` are valid closeout paths from non-terminal workflow states.
`CONVERTED`, `CLOSED`, and `LOST` are terminal. Assignment, priority,
follow-up, and status changes are written to brochure enquiry history.
