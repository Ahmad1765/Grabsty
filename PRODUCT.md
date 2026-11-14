# Product

## Register

product

## Users

Buyers and sellers of secondhand/resale fashion (clothing, shoes, accessories) transacting in PKR. Peer-to-peer: sellers list items (with a Grailed-style multi-image bundle collage), buyers browse/discover, message, make offers, and buy with Buyer Protection covering the transaction. Trust between strangers exchanging money is the central tension the product has to resolve visually and functionally.

## Product Purpose

A disciplined, trustworthy peer-to-peer fashion resale marketplace. Core loop: discover (home feed, search/discover hub with Items/Aesthetics/Brands/Users tabs) → product detail (bundle collage, offer/buy) → transact (Buyer Protection fee, cash on delivery collected by Grabsty's riders; card checkout is built but off at launch) → reputation (computed seller levels/badges/completion, shown passively). Success looks like: a buyer trusts a stranger's listing enough to pay, a seller feels the interface respects their listing rather than burying it in decoration.

## Brand Personality

Premium, quiet-luxury, disciplined. Not playful, not maximalist. The 3-color system (purple / white / ink) and meticulous AA-contrast tuning already in the codebase are brand signals, not just accessibility hygiene — a marketplace this restrained reads as more trustworthy than one that looks fun.

## Anti-references

Cluttered resale apps — Poshmark/Depop-style badges, ribbons, banners, and stickers plastered over listing cards and profiles. No gradients, no emoji-as-decoration, no sticker overlays. If a competitor pattern (Vinted, Mercari, Lekondo — see `docs/design-research/competitors/`) is loud or badge-heavy, that's a signal to do the opposite, not to match it.

## Design Principles

1. **Restraint over decoration** — every element earns its place; no ornamental flourish that doesn't carry information.
2. **Reference fidelity** — when emulating a known interaction (Instagram-style icons, the Grailed bundle collage), pull the real source pattern rather than approximating it.
3. **Trust is a visual language** — the strict palette and contrast discipline exist because this is a marketplace where strangers exchange money; delight never gets imported at the cost of that discipline.
4. **One primary action per screen** — competing CTAs get resolved to a single clear next step (see the simplified `ProductActionBar`).
5. **Show, don't tell** — reputation (seller levels/badges/completion) is computed and displayed passively, never gamified with popups or nagging.

## Accessibility & Inclusion

WCAG AA minimum. Text-color tokens are already tuned to explicit contrast ratios (e.g. `ink` at 62% opacity ≈ 5.4:1, at 55% opacity ≈ 4:1) — any new typography or color token must be checked against this bar before shipping, not assumed.
