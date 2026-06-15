# Homepage backup — before discovery repositioning

**Date:** 2026-06-15  
**Branch at backup:** `main` (commit `2b21a53`)  
**Full HTML snapshot:** [`homepage-before-discovery-repositioning-20260615.html`](./homepage-before-discovery-repositioning-20260615.html)

## Revert

To restore the pre-repositioning homepage:

```bash
git checkout main -- index.html
# or copy docs/backups/homepage-before-discovery-repositioning-20260615.html → index.html
```

## Files expected to change in repositioning pass

- `index.html` — primary homepage (hero, value cards, How It Works, new pillars section, download copy, privacy, FAQ, meta tags)
- `docs/backups/homepage-before-discovery-repositioning-20260615.md` — this file
- `docs/backups/homepage-before-discovery-repositioning-20260615.html` — frozen HTML snapshot

No other pages, APIs, or shared assets should change unless required for homepage-only styling.

## Current homepage structure (pre-pass)

1. **Sticky nav** — About, How It Works, FAQ, Privacy, Store, Download CTA
2. **Hero** — eyebrow “Built for real moments”, headline “Meet people. In real life.”, people-only subcopy, scene with 4 place cards (park/gym/coffee/event)
3. **Value cards (4)** — See who’s around, Start conversations, In real life, Meaningful by design
4. **How It Works** — “From download to real-life connection.”, 4 steps (Step 3 already “Discover what's nearby” from prior copy pass)
5. **Download / beta** — Android + iOS signup forms
6. **Privacy note**
7. **FAQ** — 6 items (people-centric framing)
8. **Footer**

## Key copy blocks (pre-pass)

### Hero

- **Eyebrow:** Built for real moments
- **Headline:** Meet people. / In real life.
- **Subheadline:** Kami helps you discover and connect with interesting people in the physical spaces you're already in.

### Value cards

| # | Title | Body |
|---|-------|------|
| 1 | See who's around | Discover nearby people in your current location. |
| 2 | Start conversations | Break the ice with easy starters and shared context. |
| 3 | In real life | From the park to the gym, Kami works where you do. |
| 4 | Meaningful by design | We limit noise so you can focus on real connections. |

### How It Works

- **Title:** From download to real-life connection.
- **Sub:** Kami is intentionally simple: install the app, connect your social context, and get notified when there is someone worth meeting nearby.
- **Step 2 title:** Enter your Instagram
- **Step 3:** Discover what's nearby (updated 2026-06-15 on main)

### Download

- **Sub:** Early access is now available on Android and iPhone. Join the beta and start exploring Austin in real life.

### Privacy

- Kami uses cloud data to power real-time discovery. Kami is designed around real-time discovery rather than long-term location tracking…

### FAQ themes

- People-only discovery framing (“interesting people in physical spaces”)
- Notification-centric “someone worth meeting” answer

## Screenshots

No automated screenshot workflow exists in this repo. Capture manually from `npm run dev` (port 3000) before/after if needed for review.
