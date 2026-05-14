# Public Website Banner Assets

## Expected files
Store all public page hero images under `frontend/public/brand/banners/`.

Required filenames:
- `home-hero.png`
- `products-hero.png`
- `subscriptions-hero.png`
- `lucky-plan-hero.png`
- `winners-hero.png`
- `about-hero.png`
- `contact-hero.png`
- `policies-hero.png`
- `rent-lease-hero.png`

## Safe replacement process
1. Keep the same filename.
2. Replace file content in `frontend/public/brand/banners/`.
3. Re-run frontend validation (`lint`, `typecheck`, `build`).
4. Verify hero readability in light and dark themes.

## Size and aspect guidance
- Recommended desktop aspect: `16:9` or `21:9`.
- Recommended minimum width: `1920px`.
- Keep critical subject matter centered-right so text overlay remains readable.
- Compress images before commit (avoid very large PNGs).

## Fallback behavior
If a mapped banner file is missing, public pages automatically render gradient fallback surfaces and do not break build/runtime.

## Legal note
AI-generated banner images are illustrative marketing assets only. They do not represent exact product guarantees, inventory guarantees, or price guarantees.
