# External Provider Environment Placeholders

These variables are placeholders for provider connection status only. Do not commit real credentials.

## Google Business Profile
- `GOOGLE_BUSINESS_PROFILE_CLIENT_ID`
- `GOOGLE_BUSINESS_PROFILE_CLIENT_SECRET`
- `GOOGLE_BUSINESS_PROFILE_ACCOUNT_ID`
- `GOOGLE_BUSINESS_PROFILE_LOCATION_ID`

## YouTube
- `YOUTUBE_API_KEY`
- `YOUTUBE_CHANNEL_ID`

## Notes
- Keep secrets only in deployment environment or secret manager.
- When missing, provider preview endpoints return configuration-required errors.
- Provider-ready stubs do not inject fake imported data.
