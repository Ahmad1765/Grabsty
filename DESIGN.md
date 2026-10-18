---
name: Grabsty
description: A disciplined, quiet-luxury peer-to-peer fashion resale marketplace
colors:
  primary: "#6C47FF"
  primary-deep: "#5538D6"
  primary-soft: "#6C47FF1A"
  primary-softer: "#6C47FF2E"
  ink: "#0F0F0F"
  ink-mute: "#0F0F0F9E"
  ink-mute-soft: "#0F0F0F8C"
  ink-hairline: "#0F0F0F14"
  ink-panel: "#0F0F0F0A"
  white: "#FFFFFF"
typography:
  display:
    fontFamily: "Inter, sans-serif"
    fontSize: "44px"
    fontWeight: 700
    lineHeight: "48px"
    letterSpacing: "-1px"
  h1:
    fontFamily: "Inter, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: "38px"
    letterSpacing: "-0.6px"
  h2:
    fontFamily: "Inter, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: "30px"
    letterSpacing: "-0.4px"
  title:
    fontFamily: "Inter, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    letterSpacing: "-0.2px"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "22px"
  body-strong:
    fontFamily: "Inter, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  body-muted:
    fontFamily: "Inter, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  caption:
    fontFamily: "Inter, sans-serif"
    fontSize: "12px"
    fontWeight: 500
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    letterSpacing: "0.1px"
  eyebrow:
    fontFamily: "Inter, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "1.4px"
rounded:
  sm: "8px"
  md: "12px"
  lg: "14px"
  xl: "16px"
  2xl: "20px"
  3xl: "24px"
  4xl: "28px"
  pill: "999px"
spacing:
  '0': "0px"
  '0.5': "2px"
  '1': "4px"
  '1.5': "6px"
  '2': "8px"
  '2.5': "10px"
  '3': "12px"
  '4': "16px"
  '5': "20px"
  '6': "24px"
  '7': "28px"
  '8': "32px"
  '10': "40px"
  '12': "48px"
  '14': "56px"
  '16': "64px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0px 18px"
    height: 44
  button-primary-disabled:
    backgroundColor: "{colors.ink-panel}"
    textColor: "{colors.ink-mute-soft}"
    rounded: "{rounded.pill}"
    height: 44
  button-ghost:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0px 18px"
    height: 44
  button-dark:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: 44
  chip-default:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
  chip-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
  card-paper:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.2xl}"
    padding: "16px"
  input-search:
    backgroundColor: "{colors.ink-panel}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "10px 12px"
---

# Design System: Grabsty

## 1. Overview

**Creative North Star: "The Quiet Atelier"**

Grabsty is a peer-to-peer fashion resale marketplace where strangers exchange real money for secondhand clothing sight-unseen. The visual system's entire job is to make that transaction feel safe without ever performing safety, the way a well-run atelier communicates quality through restraint rather than signage. Three hues do all the work: a single confident purple, paper white, and ink black used at varying opacity for every level of hierarchy. There is no fourth color hiding anywhere in the app, and that constraint is deliberate, not a limitation waiting to be lifted.

The system explicitly rejects the visual language of cluttered resale apps: no Poshmark/Depop-style badges, ribbons, or banners stacked on every listing card, no gradients, no emoji-as-decoration, no sticker overlays competing with the product photography for attention. The product photography and the seller's own words are the content; the interface is the frame, not a second act.

Where the system does allow itself life is in motion: pill-shaped controls with springy, slightly overshooting press feedback, and a floating tab bar with genuine physics (drag-to-preview, liquid indicator stretch). Restraint in color and decoration is paired with confidence in interaction, not stiffness. A quiet atelier is calm, not cold.

**Key Characteristics:**
- Strict three-hue palette: purple, white, ink-at-opacity — nothing else
- Inter only, one typeface for the entire app — no serif, ever
- Flat surfaces by default; shadows appear only as a soft, color-matched lift, never as drama
- Pill-shaped (999px radius) interactive controls; soft-rounded (16–28px) containers
- Springy, physical micro-interactions on an otherwise restrained surface

## 2. Colors

The palette reads as confident rather than colorful: one accent, used sparingly, against a near-monochrome field.

### Primary
- **Signal Purple** (`#6C47FF`): The only accent in the app. Primary CTAs, active tab-bar state, focus rings, links, brand marks. Because nothing else in the interface carries color, purple always means "this is the one thing to notice or act on."
- **Signal Purple, Deep** (`#5538D6`): Pressed/active state for purple surfaces — a darkening, not a hue shift.

### Neutral
- **Paper White** (`#FFFFFF`): The base surface for the entire app. Cards, sheets, backgrounds.
- **Ink** (`#0F0F0F`): Primary text and the "dark" surface variant (e.g. `button-dark`, active chips). Never pure `#000` in prose — see the Ink-Only Neutrals Rule below, though the raw value is near-black by design for maximum text contrast.
- **Ink, Muted** (`#0F0F0F` at 62% / `#0F0F0F9E`): Secondary text — body-muted, captions where AA (≥4.5:1) must hold for normal-size text.
- **Ink, Muted Soft** (`#0F0F0F` at 55% / `#0F0F0F8C`): Tertiary text, icons, placeholders where the AA bar is lighter (large text / non-text UI, ~4:1).
- **Ink, Hairline** (`#0F0F0F` at 8% / `#0F0F0F14`): Borders and dividers — never a visible "line," always a whisper of separation.
- **Ink, Panel** (`#0F0F0F` at 4% / `#0F0F0F0A`): Subtle fill for recessed surfaces (search bars, disabled buttons).

### Named Rules

**The Three-Hue Rule.** Only purple, white, and ink-at-opacity are permitted. Any new "accent" need (success, warning, a category color) must resolve to one of these three, expressed through weight, opacity, or icon choice, never through a new hue. This is the single most load-bearing rule in the system, and it is why Grabsty looks trustworthy without a single line of copy saying so.

**The Purpose-Built Alpha Rule.** Every muted neutral is ink at a specific, documented opacity chosen for a specific contrast ratio, not an eyeballed gray. If a new muted tone is needed, compute its contrast ratio against white before shipping it (see Accessibility in `PRODUCT.md`).

## 3. Typography

**Display Font:** Inter (sans), with the system font as fallback
**Body Font:** Inter (sans), with the system font as fallback
**Character:** One typeface for the entire app, no exceptions. Hierarchy comes from size, weight, and tracking — not from switching families — so type never distracts from product photography and there's no "decorative font" to feel dated later.

### Hierarchy
- **Display** (700, 44px, 48px line-height, -1px tracking): Reserved for the single largest headline moment on a screen (e.g. an empty-state or onboarding moment).
- **Headline / h1** (700, 32px, 38px line-height, -0.6px tracking): Screen-level headings.
- **Headline / h2** (700, 24px, 30px line-height, -0.4px tracking): Section headings within a screen.
- **Title** (700, 18px, -0.2px tracking): Card and list-item titles (e.g. listing title, seller name).
- **Body** (400, 15px, 22px line-height): Default reading copy. Cap prose blocks (descriptions, messages) at ~65-75ch equivalent width on tablet/web layouts.
- **Body, Strong** (600, 15px): Inline emphasis without switching color or size.
- **Body, Muted** (400, 14px, 20px line-height, ink-mute color): Secondary/supporting copy.
- **Caption** (500, 12px, ink-mute color): Metadata — timestamps, counts, fine print.
- **Label** (700, 13px, 0.1px tracking): Button and form-field labels.
- **Eyebrow** (700, 11px, 1.4px tracking, uppercase): Section kickers above a heading.

**Implementation note:** React Native requires the exact loaded font-family string per weight, not a family name plus a numeric weight — use `Inter_400Regular` / `Inter_500Medium` / `Inter_600SemiBold` / `Inter_700Bold` / `Inter_700Bold_Italic` as defined in `lib/theme.ts` → `type.family`. Prefer the `<AppText variant="...">` primitive (`components/ui/Text.tsx`) over ad-hoc `fontSize`/`fontFamily` props so screens can't silently drift from this scale. Plain `<Text>`/`<TextInput>` imported from `@/lib/rnText` fall back to the matching Inter weight automatically if `fontFamily` is left unset — but `<Animated.Text>` (reanimated or RN's own Animated API) does not, and needs its weight-matched Inter file set explicitly (see `components/AnimatedTabBar.tsx`).

### Named Rules

**The One Typeface Rule.** Inter is the only typeface in the app, at every size and role. No serif, no second display font, no "just this one headline" exception — hierarchy is built entirely from size, weight, and letter-spacing.

## 4. Elevation

Grabsty is flat by default. Most surfaces (cards at rest, chips, the panel/hairline neutrals) carry zero shadow — separation comes from the ink-hairline border or the ink-panel fill, not from drop shadows. Shadows are reserved for elements that are genuinely floating above the page: a filled primary button, an `elevated` card, the floating tab bar. Even there, shadows are soft and low-opacity; they read as a gentle lift, never a hard drama-shadow.

### Shadow Vocabulary
- **sm** (`0px 2px 6px rgba(0,0,0,0.04)`): The lightest lift — barely-there separation for subtly-raised elements.
- **md** (`0px 4px 12px rgba(0,0,0,0.06)`): Standard card elevation when `elevated` is explicitly set.
- **lg** (`0px 8px 20px rgba(0,0,0,0.1)`): Modals, sheets, and other content that sits clearly above the page.
- **topBar** (`0px -3px 12px rgba(0,0,0,0.06)`): Upward-cast shadow for bottom-anchored bars (action bar, tab bar).
- **Button lift** (`0px 4px 10px rgba(108,71,255,0.16)` for filled/dark buttons; none for ghost/soft/text): Filled buttons cast a shadow tinted to their own fill color (purple for primary, black for dark) rather than a generic gray — the shadow always matches what's casting it.

### Named Rules

**The Whisper Shadow Rule.** No shadow in the system exceeds 16% opacity. If a shadow is legible as "a shadow" rather than "a subtle lift," it's too strong for this system — soften it before shipping.

## 5. Components

### Buttons
- **Shape:** Fully rounded (pill, 999px radius) at every size — small (36px height), medium (44px), large (52px).
- **Primary:** Signal Purple fill, white text (label typography), purple-tinted shadow. Used for the one primary action per screen (see `PRODUCT.md` → One Primary Action).
- **Dark:** Ink fill, white text — a secondary-strong action (e.g. "Buy Now" alongside a purple "Make Offer").
- **Ghost:** White fill, ink text, 1px ink-hairline border — the default secondary action.
- **Soft:** Purple-soft (10%) fill, purple text — a quieter purple for less-committed actions than primary.
- **Text:** No fill, purple text only — tertiary/inline actions.
- **Press feedback:** Every variant responds to a press with `opacity: 0.9` and `scale: 0.97` (Reanimated spring), never a color change on press — the physical "give" of the press is the feedback, not a recolor.

### Chips
- **Style:** Pill-shaped (999px), 6px icon-to-label gap. Default ("ghost") is white fill with ink-hairline border; selected state flips to full ink fill with white text — a hard, unambiguous on/off rather than a color-intensity change.
- **Count badge:** A small pill inside the chip (purple-soft fill, purple-deep text when inactive; purple fill, white text when the parent chip is active) — used for counts like saved-search results.

### Cards
- **Corner Style:** 20px radius (`rounded.2xl`) by default; callers can opt into any step of the radius scale.
- **Background:** Paper white, with a 1px ink-hairline border by default (the "paper" variant) — border does the separation work, not shadow.
- **Shadow Strategy:** Flat at rest; pass `elevated` to opt into the `md` shadow (see Elevation).
- **Internal Padding:** 16px default.

### Inputs
- **Style:** No visible stroke by default — a recessed `ink-panel` (4% ink) fill with `xl` (16px) radius reads as "a place to type" without drawing a hard border.
- **Focus:** Text inputs never show the browser/OS default focus ring (suppressed globally in `global.css`); the caret and the field's own recessed fill are the only focus signal. Non-text controls (buttons, chips) do keep a visible `focus-visible` ring (2px solid purple) for keyboard accessibility.

### Navigation — Signature Component
The bottom tab bar (`components/AnimatedTabBar.tsx`) is the system's one deliberately expressive component: a floating, blurred dock with a purple pill that slides beneath the active tab using spring physics (not a linear tween), stretches slightly under fast swipes ("liquid" motion), and supports drag-to-preview between tabs with haptic feedback on commit. Inactive icons are outline glyphs at `ink-mute-soft`; the active icon swaps to its filled counterpart inside the purple pill. This is where the system spends its "delight budget" — everywhere else stays calm specifically so this component can feel alive without the app as a whole feeling busy.

## 6. Do's and Don'ts

### Do:
- **Do** keep every accent color resolving to Signal Purple (`#6C47FF`) — no new hues, ever, per the Three-Hue Rule.
- **Do** compute and document the contrast ratio for any new muted-ink tone before shipping it (target WCAG AA, ≥4.5:1 for normal text, ≥3:1 for large text/UI).
- **Do** default new containers to flat (no shadow) and reach for a shadow only when something is genuinely floating above the page.
- **Do** use pill radius (999px) for anything pressable, and 16–28px radius for containers.
- **Do** let the product photography and the bundle collage be the visual centerpiece of the product page; design around them, not over them.
- **Do** give pressable elements physical, springy feedback (scale + opacity), consistent with the tab bar's physics vocabulary.

### Don't:
- **Don't** add Poshmark/Depop-style badges, ribbons, banners, or stickers to listing cards or profiles — this is the system's primary anti-reference and the fastest way to make Grabsty look like every other resale app.
- **Don't** use gradients anywhere, including "just for a hero" or "just for a button" — the `gradients` token exists in code only for legacy API compatibility and collapses to flat purple; never reintroduce an actual gradient.
- **Don't** use emoji as decoration in the UI (icons via Feather/Ionicons only).
- **Don't** introduce a second typeface anywhere, including a serif for a single headline moment — Inter is the only typeface in the app, per the One Typeface Rule.
- **Don't** stack more than one primary (filled) button on a single screen — resolve competing CTAs to one primary and demote the rest to ghost/soft/text.
- **Don't** ship a shadow above 16% opacity, or a colored shadow that doesn't match the element casting it.
