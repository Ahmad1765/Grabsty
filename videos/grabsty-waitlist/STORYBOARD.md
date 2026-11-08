---
format: 1080x1920
message: "Stop paying strangers in advance — Grabsty holds your money until you've checked the item. Lahore opens first: join the waitlist."
arc: PAS, compressed — chat hook → pain flash → turn → mechanism (3 steps) → sellers → CTA
audience: Pakistani buyers and sellers of pre-loved clothes, sneakers and bags who've been burned (or nearly) by Instagram / WhatsApp / OLX advance-payment scams; Lahore first. 18–30, watching Reels / TikTok / Shorts, often muted.
music: confident modern hip-hop / trap-lite instrumental, punchy kick, urban fashion energy, no vocals, 95–105 BPM
angle: safe resale — "the seller doesn't get your money first"
length: ~25.5s
language: English on-screen text; chat in Roman Urdu. NO voiceover (music-only) — captions skipped; the type IS the message
---

## Video direction

- **NO VOICEOVER — music only.** Each frame's `on_screen_cue` line is the old VO, kept only as the reading-rhythm guide: where a Scene says "On '…'", that is a beat cue at the Scene's start time, not a spoken word. All meaning must be readable from on-screen type alone — give each text reveal enough hold to read (≈ 0.25s per word minimum). Cut-ins land on strong music beats (kick/snare); keep reveals snappy. Scene windows below were written for ~0.5s shorter frames — keep each reveal's start time as written and give the extra time to the frame's final hold.
- **Reels-safe zone** — no captions, but Reels/TikTok UI covers the bottom ~17% (username, caption) and a ~12% strip on the right (like/share icons). Keep all text and key art in the top ~83% and away from the far-right strip.

- **Canvas** — 1080×1920 portrait. All content lives in the top ~83%; the bottom ~17% is the caption band (keep clear). Side gutters generous; type sized for a phone held at arm's length (display lines fill ~85% of width).
- **Palette system (from `frame.md`)** — ground = ink `#0F0F0F` (frames 1, 2, 4, 5, 6) with the faint 1px grid wallpaper the site uses; frame 3 is the one full **Signal Purple `#6C47FF`** field (the turn). Text = paper `#FFFFFF`. Cards = ink surfaces `#171717`/`#1F1F1F` with 2–3px white hairline borders, **square corners, hard purple offset shadow** (no blur). Destructive red `#EF4444` appears ONLY in frame 2 and the "blocked" system line of frame 1 (approved semantic exception for scam/loss). Shield icon = canonical `#5356EE` stroke on `#F2F3FE`. Every other color comes only from the brand stickers / 3D props. No gradients, no glows beyond a single subtle purple bloom behind the 3D G in frame 3.
- **Type** — display = Bricolage Grotesque 96pt 700, UPPERCASE, tight (~0.9 lh), the site's "RESALE FASHION STRIPPED OF CLUTTER." voice. Body/chat = Bricolage Grotesque 400/500 sentence case. Chips/kickers/system lines = JetBrains Mono uppercase, tracked, in thin outlined boxes.
- **Motion grammar** — smooth long-tail settles (`power3`; `expo.out` for fast slams). Overshoot allowed ONLY on sticker slaps (they're physical paper — one small rotate-settle) — never on type or cards. Every piece reveals on its spoken cue; nothing front-loaded. Holds are still; at most a subtle jitter on stickers.
- **Rhythm / held frames** — F1 builds (typed chat), F2 staccato fast, **F3 is the breather**: the turn lands and HOLDS still for its back half. F4 builds steadily (3 cues), F5 quick snap, F6 builds to a deliberate **final 1.5s hold** on LINK IN BIO · grabsty.com (the only real exit is this frame's end).
- **Sound** — SFX sparingly: message whooshes in F1, an error thud on "blocked", three hits in F2, a riser into F3, soft clicks per step in F4, a stamp in F5, a tap/click in F6.
- **Negative list** — no Instagram/WhatsApp logos, names, or exact UI (generic DM chrome only); no stock photos or people; no gradients / AI-purple blobs / bokeh; no pill-shaped purple buttons (purple filled buttons use 10px corners); no `×` icons; no emoji. No slideshow (front-load then freeze) and no screensaver (many things floating independently); no lazy breathing, no back-half slow push.

## Frame 1 — The DM

- scene: A generic dark DM thread (NO Instagram/WhatsApp branding) fills the phone frame. Buyer bubble types in: "Bhai payment bhej di hai — Rs 6,500". Seller: "Done, kal ship kar dunga". Beat. A grey system line drops in: "You can't message this account." The thread desaturates.
- on_screen_cue: "You paid in advance… and they blocked you."
- duration: 4s
- transition_in: cut
- status: animated
- src: compositions/frames/01-the-dm.html
- type: hook
- persuasion: Pain validation through instant recognition (the viewer has seen this exact thread)
- beat: recognition → sting
- blueprint: typewriter-reveal (Adapt)
- focal: (typography/UI only — reconstructed chat)
- roles: chat thread = hero UI reconstruction
- sfx: message-send whoosh, message-receive pop, error thud

Adapt: keep the typed-line-as-engine signature (caret types the buyer's message live); the typed line sits in a chat composer, then "sends" into a bubble. No brand payoff — the payoff is the block.
Scene 1 (0.0–1.3s): Ink ground. Minimal generic DM header pinned top (grey circle avatar, handle "@thrift.drops.pk", mono "Active now") — upper third. A composer bar near mid-frame; the buyer line **types on with caret** (`discrete-text-sequence` + `context-sensitive-cursor`): "Bhai payment bhej di hai — Rs 6,500". On send it lifts into a right-aligned Signal Purple bubble (square-ish 10px corners) with a tiny mono "Seen".
Scene 2 (1.3–2.2s): As VO says "…and", the seller's grey left-aligned bubble rises in on a smooth settle: "Done, kal ship kar dunga". Thread stacks, bubbles large (chat text ~5% of width).
Scene 3 (2.2–3.5s): On "blocked you": a red mono system line slams in under the thread — "YOU CAN'T MESSAGE THIS ACCOUNT" in a thin red-outlined box; the avatar greys out, the whole thread desaturates/dims to ~45% while the red line stays sharp (`depth-of-field-blur` dim-the-rest). Hold still.

## Frame 2 — Fake. Torn. Never shipped.

- scene: The dead thread is shoved aside; three words slam full-width one per cue — "REPLICA." "TORN." "NEVER SHIPPED." — in destructive red (#EF4444, approved exception) on ink, the last one cracking.
- on_screen_cue: "Or it shows up fake. Or it never shows up at all."
- duration: 3s
- transition_in: cut
- status: animated
- src: compositions/frames/02-fake-torn.html
- type: pain_point
- persuasion: Pain agitation — rule of three escalating losses
- beat: frustration → anxiety
- blueprint: kinetic-type-beats (Reproduce)
- focal: (typography only)
- roles: —
- sfx: impact hit ×3 (escalating)

Signature: statement builds across full-screen beats, each its own move (`kinetic-beat-slam`).
Scene 1 (0.0–0.9s): Ink ground with grid. "REPLICA." **scale-slams** in, display-hero size, paper white, centered in the upper-middle, with a red hard offset shadow.
Scene 2 (0.9–1.8s): Hard cut-swap (`discrete-text-sequence`) — "REPLICA." stacks up and shrinks to a row above; "TORN." **side-snaps** in below it, same scale.
Scene 3 (1.8–3.0s): On "never shows up at all": "NEVER SHIPPED." **rise-slams** in as the third stacked line, full width, in red `#EF4444`; a mono red chip "RS 6,500 — GONE" snaps under it. All three lines locked as a stacked left-aligned block (~70% of height of the content area). Hold still.

## Frame 3 — The turn

- scene: Hard flip to Signal Purple. The glossy 3D G tile drops in and lands; wordmark locks up; the line "The seller doesn't get your money first." types beneath in paper white.
- on_screen_cue: "On Grabsty, the seller doesn't get your money first."
- duration: 3.5s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/03-the-turn.html
- type: product_intro
- persuasion: Negative contrast — the exact opposite of the scam rule
- beat: relief + curiosity
- blueprint: logo-assemble-lockup (Adapt)
- focal: assets/3d-g-tile.png
- roles: 3d-g-tile = cutout hero (sits on a white-bordered ink plate so its dark crop edge never touches the purple field) · logotype-white = supporting lockup
- sfx: riser into a soft bass drop on the G landing

Adapt: keep the logo-builds-into-a-lockup signature (the G arrives and the wordmark completes beside/below it); the extension is the plain-English promise instead of a URL.
Scene 1 (0.0–1.0s): Full Signal Purple field (clip-layer background). On "On Grabsty": the 3D G tile, set inside a square ink plate with a 3px white border and hard ink offset shadow, **drops in** from above and settles (`spring-pop-entrance`, smooth settle) — centered, upper-middle, ~45% of width. A single soft white bloom behind it (`ambient-glow-bloom`, low).
Scene 2 (1.0–1.6s): The white Grabsty wordmark completes below the plate, letters cascading left→right (`dynamic-content-sequencing`), ~70% of width.
Scene 3 (1.6–3.5s): As VO says "the seller doesn't get your money first", the promise **types per-word** (`dynamic-content-sequencing`) beneath in display-head uppercase paper white, two lines: "THE SELLER DOESN'T GET / YOUR MONEY FIRST." — the word "FIRST." sits in an ink box with white text (marker block). Then hold still — the breather.

## Frame 4 — Pay. We hold it. You check it.

- scene: Three huge steps, one per cue, stacking down the vertical frame with purple hard offset shadows: 01 YOU PAY → 02 GRABSTY HOLDS IT (3D shield lands on this card) → 03 YOU GET 48 HRS TO CHECK IT → final chip snaps on: "THEN THE SELLER GETS PAID." The price-tag sticker rides along as the "order".
- on_screen_cue: "You pay. We hold it. Your order arrives — you get forty-eight hours to check it. Then the seller gets paid."
- duration: 6.5s
- transition_in: push-slide UP
- status: animated
- src: compositions/frames/04-pay-hold-check.html
- type: feature_showcase
- persuasion: Show-don't-tell mechanism + risk reversal
- beat: clarity + control
- blueprint: grid-card-assemble (Adapt)
- focal: assets/3d-shield-sticker.png
- roles: 3d-shield-sticker = cutout on step 02 card · svg-b374dbc7 = small icon on step 03 · sticker-7 = supporting "the order" prop
- sfx: soft click per step ×3, success chime on final chip

Adapt: keep the staggered self-assembling vertical list (`center-outward-expansion`-style cascade, one card per cue, co-resident and accumulating); cards are big numbered step-cards, not a tile grid.
Scene 1 (0.0–1.0s): Ink ground + grid. Mono kicker chip top: "HOW A GRABSTY ORDER WORKS". On "You pay": card 01 rises into slot 1 (full-width ink card, white hairline border, hard purple offset shadow): huge "01" step-num left, "YOU PAY" display right. The price-tag sticker (sticker-7) slaps onto the card's right edge, slight tilt.
Scene 2 (1.0–2.2s): On "We hold it": card 02 rises into slot 2 — "GRABSTY HOLDS IT", mono sub "SELLER NOT PAID YET"; the 3D shield (cutout) drops onto its right side and settles. A thin purple connector line **draws** from card 01 to 02 (`svg-path-draw`).
Scene 3 (2.2–4.6s): On "forty-eight hours to check it": card 03 rises into slot 3 — "48 HRS TO CHECK IT", the "48" counts 0→48 (`counting-dynamic-scale`), canonical shield-check icon at right; connector draws 02→03.
Scene 4 (4.6–6.0s): On "Then the seller gets paid": a filled Signal Purple chip (10px corners) snaps under the stack — "THEN THE SELLER GETS PAID ✓" (checkmark as SVG stroke, draws on). Hold the full stack still.

## Frame 5 — Selling?

- scene: Quick swing to the seller side: kicker chip "SELLING?" then "No more fake COD orders." — a stamped "CONFIRMED" mark slaps onto an order chip; safety-pin sticker spins in.
- on_screen_cue: "Selling? Confirmed orders only — no more fake C-O-D."
- duration: 3.5s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/05-selling.html
- type: benefit_highlight
- persuasion: Two-sided value — recruit supply, not just demand
- beat: confidence
- blueprint: kinetic-type-beats (Adapt)
- focal: (typography + order chip)
- roles: sticker-6 = supporting accent (top-right) · sticker-8 = supporting accent (lower-left, partially off-edge)
- sfx: whoosh, rubber stamp thud

Adapt: keep the hard-cut line build; payoff is a stamp instead of a spring-pop word.
Scene 1 (0.0–0.8s): Ink ground. On "Selling?": "SELLING?" slams in display-lg, upper third, left-aligned; safety-pin sticker (sticker-6) slaps in top-right with a small rotate-settle.
Scene 2 (0.8–1.9s): On "Confirmed orders only": an order card rises center (ink surface, white hairline, purple offset shadow) — mono "ORDER #GRB-2041 · COD · RS 4,200"; a big outlined stamp "CONFIRMED" (paper white, square, slight −6° tilt) **slaps** onto it (`press-release-spring` compress-settle).
Scene 3 (1.9–3.0s): On "no more fake COD": below the card, "NO MORE FAKE COD." per-word reveal in display-head; "FAKE COD" struck through with a hand-drawn red line (`css-marker-patterns` sketch-strike). CERTIFIED THRIFTER sticker (sticker-8) tucks in lower-left. Hold.

## Frame 6 — Lahore opens first

- scene: "LAHORE OPENS FIRST." slams in; the real waitlist form card rises; a spot-number chip ticks up to "#GRB-1024 — YOUR SPOT"; the purple JOIN WAITLIST button gets a tap; "LINK IN BIO · grabsty.com" holds for the last 1.5s; lime "GRABSTY GOT YOU!" bag sticker pops in the corner.
- on_screen_cue: "Lahore opens first. Grab your spot — link in bio."
- duration: 5s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/06-lahore-first.html
- type: cta
- persuasion: Scarcity / early-access status + friction reduction (free, one tap)
- beat: urgency-to-act + belonging
- blueprint: cta-morph-press (Adapt)
- focal: assets/ui-waitlist-form.png
- roles: ui-waitlist-form = supporting proof card (tilted, partially masked behind the CTA) · sticker-1 = accent (top-right) · logotype-white = lockup at the hold
- sfx: impact on headline, tick for spot counter, UI click on button

Adapt: keep the condense-to-one-CTA + human tap signature; instead of the brand mark condensing, the waitlist form card condenses down into the single JOIN WAITLIST button.
Scene 1 (0.0–1.0s): Ink ground + grid. On "Lahore opens first": mono chip "WAITLIST HUB · LAHORE" then "LAHORE / OPENS FIRST." slams in display-lg, top third, paper white with purple offset shadow. Lime bag sticker (sticker-1) slaps in top-right.
Scene 2 (1.0–2.3s): The real waitlist form screenshot rises in center at a slight tilt inside a white-bordered frame with purple offset shadow (~75% width). A spot chip pinned to its corner counts up "#GRB-1000 → #GRB-1024 — YOUR SPOT" (`counting-dynamic-scale`, tabular nums).
Scene 3 (2.3–3.0s): On "Grab your spot": the form card **condenses** into a filled Signal Purple JOIN WAITLIST button at the same center (`card-morph-anchor`, 10px corners, white bold label); a pointer cursor arrives and taps it (`cursor-click-ripple`, press-compress).
Scene 4 (3.0–4.5s): On "link in bio": below the button, the white Grabsty wordmark + "LINK IN BIO · GRABSTY.COM" mono line reveal; everything holds still to the end (final frame — the hold is the exit).
