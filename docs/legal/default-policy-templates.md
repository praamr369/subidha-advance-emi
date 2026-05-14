# Default Policy Templates

## Source of truth in code
Default editable templates are stored in:
- `backend/subscriptions/services/default_policy_templates.py`

Templates are seeded as **draft by default** via:
- management command: `python manage.py seed_policy_pages`
- admin API: `POST /api/v1/admin/public-site/policies/seed-defaults/`

## Included template slugs
1. `terms`
2. `privacy`
3. `refund-cancellation`
4. `warranty`
5. `delivery-policy`
6. `rental-lease-policy`
7. `lucky-plan-policy`
8. `direct-sale-policy`
9. `payment-policy`
10. `service-policy`
11. `grievance`
12. `data-requests`
13. `business-compliance`
14. `udyam-msme`
15. `ownership-business-proof`
16. `contact-enquiry-policy`

## Placeholder variables supported
- `[WEBSITE_URL]`
- `[BUSINESS_PHONE]`
- `[BUSINESS_EMAIL]`
- `[BUSINESS_ADDRESS]`
- `[GST_STATUS_PUBLIC_TEXT]`
- `[UDYAM_STATUS_PUBLIC_TEXT]`

These placeholders are resolved at public read time by:
- `render_policy_content(...)` in `backend/subscriptions/services/policy_governance_service.py`

## Safety note
Templates are editable business drafts, not immutable legal truth. Public visibility occurs only after explicit admin publish action.
