# Customer Follow-up and Communication Log

## Current implementation
Follow-up and communication logging is implemented through `crm.PartyInteraction` and admin CRM endpoints.

### Supported interaction types
- `GENERAL`
- `CONTACT_NOTE`
- `FOLLOW_UP`
- `HANDOFF`

### Supported status lifecycle
- `OPEN`
- `DONE`
- `CANCELLED`

### Stored follow-up fields
- subject
- note
- happened_at
- next_follow_up_at
- completed_at
- created_by
- optional linked reminder (`reminder_id`)
- optional related source (`related_source_model`, `related_source_pk`)

## Operational usage
1. Use CRM party detail (`/api/v1/crm/parties/{id}/`) as customer communication timeline source.
2. Create interaction for each call/contact/handoff.
3. Mark interaction status explicitly to keep queue truth clear.
4. Use reminder linkage for payment follow-up scheduling when needed.

## Control constraints
- Follow-up logging does not post payments.
- Follow-up logging does not alter EMI or lucky draw states.
- Follow-up logging does not replace support-ticket workflow for issues that require resolution tracking.

## Future additive proposals (not implemented yet)
- Standardized communication outcome codes (no-answer, callback-requested, disputed, verified).
- Optional call recording reference field for external telephony integration.
