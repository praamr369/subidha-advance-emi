# Public UI Animation Guidelines

## Principles
- Keep animations subtle and professional.
- Animate only `opacity` and `transform` where possible.
- Avoid heavy/parallax scripts and avoid layout shifts.
- Respect `prefers-reduced-motion`.

## Current approved animation behaviors
- Hero image: subtle zoom on hover.
- Public cards: gentle lift on hover.
- Trust badges: light breathing motion.
- Section reveal: short fade-up entrance.

## Reduced motion
When user OS/browser requests reduced motion, disable/soften all hero/card/trust animations and transitions.

## Accessibility
- Motion is decorative only; no critical information is motion-only.
- Maintain keyboard focus visibility during animated states.
- Keep text contrast readable over banners and overlays.

## Performance
- Use local static images only (`/public/brand/banners`).
- Do not use remote image URLs.
- Use Next Image for hero media where practical.
- Use `priority` only for top-most hero image on home page.
