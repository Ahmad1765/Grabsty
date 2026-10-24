# Grabsty — React Native / Expo Performance Audit

**Date:** 2026-07-30
**Branch:** `feature/push-notifications`
**Stack (verified from `package.json` / resolved config):** Expo SDK `~54.0.36`, React Native `0.81.5`, React `19.1.0`, Hermes (default), New Architecture (default-on in SDK 52+, not disabled here), Expo Router `~6.0.24`, Reanimated `~4.1.1` + `react-native-worklets@0.5.1`, NativeWind `4.1.23`, TanStack Query `5.101`, Supabase JS `2.45`.
**Workflow:** managed / CNG — no `android/` or `ios/` directories.

---

## Phase 1 — Research basis

Every recommendation below is anchored to one of these current sources. Nothing here is speculative or carried from memory.

| Source | What it established |
|---|---|
| [Expo — React Compiler](https://docs.expo.dev/guides/react-compiler/) | `experiments.reactCompiler: true` is the enable switch; Babel auto-configured in SDK 54+; app code only, no node_modules; validate with `react-compiler-healthcheck` |
| [Expo — Tree shaking](https://docs.expo.dev/guides/tree-shaking/) | `EXPO_UNSTABLE_TREE_SHAKING=1`, `EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1`; barrel/star-export expansion; ESM-only; production-only |
| [Expo — Analyzing bundles](https://docs.expo.dev/guides/analyzing-bundles/) | `EXPO_ATLAS=true npx expo export` is the current bundle-inspection path (source-map-explorer is SDK ≤50) |
| [Expo — New Architecture](https://docs.expo.dev/guides/new-architecture/) | SDK 54 is the **last** SDK where New Arch can be disabled; ~83% of SDK 54 EAS builds already on it |
| [RN — Optimizing FlatList configuration](https://reactnative.dev/docs/optimizing-flatlist-configuration) | `windowSize`, `maxToRenderPerBatch`, `initialNumToRender`, `getItemLayout`, `removeClippedSubviews` semantics + tradeoffs; memoize row components; no anonymous `renderItem` |
| [FlashList v2 docs](https://shopify.github.io/flash-list/docs/) / [Expo SDK — flash-list](https://docs.expo.dev/versions/latest/sdk/flash-list/) | v2 is built for the New Architecture and **requires Fabric**; `npx expo install @shopify/flash-list`; no config plugin; FlatList-compatible API |
| [Expo SDK 54 changelog](https://expo.dev/changelog/sdk-54) | RN 0.81 + React 19.1; precompiled iOS XCFrameworks |

**Local verification run during the audit:**

```
$ npx react-compiler-healthcheck@latest
Successfully compiled 156 out of 156 components.
StrictMode usage not found.
Found no usage of incompatible libraries.

$ npx tsc --noEmit      → exit 0
$ npx expo lint         → 0 errors, 1 warning (unused var, AnonCards.tsx:146)
```

---

## Phase 2 — What the codebase actually does

~35.7k lines of TS/TSX across `app/` (24 routes), `components/` (61), `lib/` (55).

Already correct — **do not "fix" these**:

- **Data layer is sound.** TanStack Query with a central key factory (`lib/queries.ts`), `staleTime: 60s`, `gcTime: 5m`, AsyncStorage persistence with a version buster, `refetchOnWindowFocus: false` with explicit `useFocusEffect` + `isStale` gating. This is the modern pattern, correctly applied.
- **The like/save N+1 is already solved.** `lib/engagementCache.ts` collapses what would be 60+ per-card round-trips into one query per user per 30s, with in-flight dedupe and optimistic writes.
- **Images already use `expo-image`** in 27 files (only one stray `react-native` `Image`), with `cachePolicy="memory-disk"`, `recyclingKey`, `priority`, and CDN width negotiation via `lib/images.ts`.
- **Feed payloads are already slimmed** — `SELECT_FEED` in `lib/listings.ts` drops `description` and narrows the seller embed.
- **Auth context identity is already stabilized** (`lib/auth.tsx`) after the documented infinite-refetch incident.
- **`babel.config.js` is correct.** Two presets, no manual `react-native-worklets/plugin` — SDK 54's `babel-preset-expo` injects it. Adding it back would triple-stack the transform.
- **The two `useNativeDriver: false` sites are correct and must stay** — `app/auth/login.tsx` interpolates into `height`, `components/discover/SearchTabs.tsx` interpolates a color. Neither is native-driver-capable.
- **Native font blocking in `app/_layout.tsx` is deliberate and correct** — Android does not repaint mounted `<Text>` when a font registers late.
- **Zero `console.log` in `app/`, `components/`, `lib/`.**

---

## Phase 3 — Issues found

Ranked by impact × confidence. Every issue below is verified against the actual source, not inferred.

### P0-1 — No list virtualization anywhere. Every listing grid mounts every row.

**Where:** `app/(tabs)/index.tsx:768` (`Grid`), `app/(tabs)/discover.tsx:1210`, `app/(tabs)/profile.tsx:1023` (`ListingsGrid`), `app/user/[id].tsx:611`.

All four are the same shape: a plain `<ScrollView>` whose children are `rows.map(...)` → `<ListingCard>`. There is no `FlatList`, `SectionList`, or `FlashList` on any grid — RN's virtualized list primitives appear only in `chat.tsx`, `conversation/[id].tsx`, and the followers/following screens.

**Why it's a problem.** Query limits are 48–60 rows (`useMyFeedListingsQuery` → 48/60, `useFeedListingsQuery({limit: 60})`, `searchListings({limit: 60})`). Every one of those rows mounts immediately, on the JS thread, before first paint of the grid. And `ListingCard` is not cheap — per card:

- a `PressableScale` (Reanimated node)
- a `PopIcon` (second Reanimated node)
- for multi-image listings, a **nested horizontal paging `ScrollView`** with one `expo-image` per photo
- an `onLayout` handler that calls `setCardWidth` → a second render of every card
- a `useEffect` that resolves `fetchIsLiked` → `setLiked` → a third render of every card

So a 60-row feed mounts ~60 nested scroll containers, 60–180 image views, ~120 Reanimated nodes, and does ~180 renders during mount. This is the dominant cost on the two most-visited screens in the app.

**Impact:** slow first paint on Home and Discover; jank and dropped frames while scrolling; memory held for off-screen images that `removeClippedSubviews` would otherwise release; worst on low-end Android.
**Estimated improvement:** the largest single win available. Mount work drops from *N* rows to roughly one viewport plus the draw-distance buffer — for a 60-row feed that is ~8–12 cards instead of 60. Expect a step-change in time-to-interactive on Home/Discover and in scroll smoothness, not a marginal one.
**Risk of fixing:** **Medium.** These grids sit inside scroll views that also host headers, chip rows, and rails, so the fix is a real restructure (list header component + `numColumns`), not a drop-in. FlashList v2 additionally **requires the New Architecture** — satisfied here, but it is a hard requirement.

---

### P0-2 — `ToastProvider` creates a new context value on every render, re-rendering the whole app.

**Where:** `lib/toast.tsx:155` — `<ToastContext.Provider value={{ show }}>`.

`ToastProvider` wraps the entire `<Stack>` in `app/_layout.tsx`. It holds `useState` for `toast` and `visible`, so **every toast show, every dismiss, and every animation-completion callback re-renders the provider** — and each of those renders allocates a fresh `{ show }` object.

**Why it's a problem.** React compares context values by identity. A new object every render means every `useContext(ToastContext)` consumer re-renders, unconditionally. `ListingCard` calls `useToast()`. So **showing any toast re-renders all 60 listing cards** — and `React.memo` on `ListingCard` cannot stop it, because context propagation bypasses memo entirely.

This is the same class of bug as the `lib/auth.tsx` infinite-refetch incident already documented in this repo, and every *other* provider in the tree (`GuestGate`, `SellSheet`, `DiscoverSheet`, `Auth`) already memoizes its value correctly. Toast is the one that was missed.

**Impact:** a visible stutter every time a toast fires while a grid is on screen — which is exactly when toasts fire (like failed, item saved, feed removed).
**Estimated improvement:** eliminates 60+ wasted component renders per toast event, ×4 events per toast lifecycle (show, animate-in, timer, dismiss).
**Risk of fixing:** **Very low.** One-line `useMemo`. `show` is already a stable `useCallback`.

---

### P1-1 — React Compiler is not enabled, and this codebase is its ideal candidate.

**Where:** `app.config.js` — `experiments` contains only `typedRoutes: true`.

The code style throughout is inline arrow props and inline style objects — `app/(tabs)/index.tsx` alone passes ~15 inline `onPress` closures and every `style={{...}}` is a fresh object per render. That is a deliberate, readable style, and hand-memoizing it all would be a large, risky, low-value diff.

**Why it matters.** React Compiler does exactly that memoization automatically at build time, without touching the source. Per Expo's docs it is auto-configured in SDK 54 and applies to app code only.

**The healthcheck passes cleanly on this repo: 156/156 components compile, no incompatible libraries, no StrictMode conflicts.** That is an unusually clean result and the strongest possible signal to turn it on.

**Impact:** broad reduction in re-render work across every screen, at zero source-diff cost.
**Estimated improvement:** moderate and diffuse — meaningful on render-heavy screens (Home, Discover, `product/[id]`), invisible elsewhere. It does **not** substitute for P0-1; virtualization and memoization solve different problems.
**Risk:** **Low-medium.** It is still flagged experimental by Expo. Behaviour changes only if a component violates the Rules of React — the healthcheck found none. Rollback is deleting one config line.

---

### P1-2 — `lucide-react-native` is a dependency with zero imports.

**Where:** `package.json:53`. Grep across `app/`, `components/`, `lib/` returns **no matches**.

Icons come from `@expo/vector-icons` (`Feather`, `Ionicons`) everywhere.

**Why it's a problem.** Even with Metro's dead-code elimination, an unused dependency is install weight, lockfile surface, audit surface, and a standing invitation to import a *second* icon system. Icon libraries are also the canonical barrel-file bundle hazard called out in Expo's tree-shaking guide.

**Impact:** small but free. **Risk of fixing:** **Very low** — nothing imports it.

---

### P1-3 — `ListingCard` does three render passes per card on mount.

**Where:** `components/ListingCard.tsx:31–67`.

Three independent state writes fire during mount for every card:
1. `useState(0)` → `onLayout` → `setCardWidth(width)` (line 146)
2. `useEffect` → `fetchIsLiked(...).then(setLiked)` (line 55)
3. `useEffect` on `[listing.likes]` → `setLikeCount` (line 65–67) — this one fires on mount even though `likeCount` was already initialized to the same value at line 34.

**Why it's a problem.** #3 is a strictly redundant render on every card. #1 forces the image to render at a placeholder width (`cardWidth || 200`) then re-render at the true width — and the parent grid *already computes the exact card width* via `useGridDimensions` and passes it down as a wrapper `style={{ width: cardWidth }}`. The measurement is re-deriving a number the parent already knows.

**Impact:** ~120 avoidable renders on a 60-card grid mount, plus a first-frame image at the wrong source width.
**Estimated improvement:** modest on its own; compounds significantly with P0-1 since it is per-card cost.
**Risk of fixing:** **Low-medium.** Passing `cardWidth` down as a prop is a behavioural no-op but touches all four grid call sites. The `likeCount` guard is trivial.

---

### P1-4 — Metro tree shaking is available but not switched on.

**Where:** no `EXPO_UNSTABLE_TREE_SHAKING` / `EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH` anywhere in `eas.json` or the build scripts.

Per Expo's guide these are production-only, ESM-only, and expand star-exports so unused barrel members are dropped — directly relevant to `@expo/vector-icons`, `lucide-react-native` (see P1-2), and `components/ui/index.ts`.

**Impact:** smaller production bundle → faster JS parse/eval → faster cold start.
**Estimated improvement:** unknown without measurement. **This must be measured with `EXPO_ATLAS=true npx expo export` before and after, not assumed.**
**Risk:** **Medium.** Explicitly marked unstable by Expo. Requires a full export + smoke test on both platforms before it goes anywhere near a production channel.

---

### P2-1 — Screen freezing (`react-native-screens`) is not configured.

No `enableFreeze`, `enableScreens`, or `freezeOnBlur` anywhere in the codebase. With six tab screens (several data-heavy), blurred tabs keep re-rendering on context and query-cache changes.

**Caveat that matters:** there is a live report of `freezeOnBlur: true` + `enableFreeze(true)` interacting badly with tab-bar rendering on iOS around `expo ~54.0.31` / `react-native-screens ~4.19.0` — and this app uses a **fully custom** `AnimatedTabBar` with Reanimated shared values and gesture state. That is precisely the configuration those reports involve.

**Impact:** moderate CPU/battery saving on backgrounded tabs.
**Risk:** **Medium-high for this specific app.** Recommend deferring until P0/P1 are shipped and measured, then trialling on one screen at a time with device testing. Not a blind enable.

---

### P2-2 — Minor allocation churn on the Home screen.

`app/(tabs)/index.tsx:112` — `const priceDrops = priceDropsQ.data ?? []` allocates a new array every render, while the three sibling queries correctly use module-level stable constants (`EMPTY_LISTINGS`, `EMPTY_SAVED_SEARCHES`, lines 58–59).

It happens not to feed a `useMemo` dependency today, so it is currently harmless — but it is inconsistent with the stable-reference discipline the rest of the file establishes, and would silently become a bug the moment someone memoizes on it.

**Impact:** negligible now, cheap insurance. **Risk of fixing:** **Very low.**

---

### P2-3 — `components/AnonCards.tsx:146` — `SectionEyebrow` defined but never used.

The only lint warning in the repo. Dead code. **Risk of fixing: none.**

---

## Non-issues — checked and explicitly cleared

So these are not re-litigated later:

- **New Architecture** — on. Default in SDK 52+, not disabled in `app.config.js`. No migration needed.
- **Hermes** — on. Default engine, not overridden.
- **Babel/Reanimated plugin ordering** — correct, and the existing comment explains why the manual plugin entry must stay absent.
- **Metro config** — correct. `getSentryExpoConfig` + `withNativeWind` in the right order.
- **TypeScript** — `strict: true`, clean compile, path aliases configured.
- **Secrets** — no keys in source. `EXPO_PUBLIC_*` for public values only (correct: anon key, DSN, PostHog key are all publishable). `SENTRY_AUTH_TOKEN` isolated in `.env.sentry-build-plugin` and read by the plugin, not the bundle. `expo-secure-store` present and plugin-registered.
- **`@mediapipe/tasks-vision`** — never enters the Metro bundle; loaded from jsDelivr at runtime in `lib/photoClean/engine.web.ts`, web-only. Correctly handled.
- **OTA / `runtimeVersion`** — `fingerprint` policy with `fallbackToCacheTimeout: 0`. Correct: never blocks cold start on an update fetch.
- **Supabase client** — hard fetch timeout, bounded auth lock with graceful fallback. Well-hardened.
- **Realtime subscriptions** — `lib/chat.ts` channels are all paired with `removeChannel` in cleanup. No leak.
- **`LiveActivityTicker` `setInterval`** — cleaned up on unmount; native-driven where possible. Fine.
- **Accessibility** — `accessibilityRole`/`Label`/`State` and `hitSlop` presets used consistently. Nothing below should reduce this.

---

## Phase 4 — Recommended sequencing

| Tier | Items | Risk | Verify with |
|---|---|---|---|
| **1 — apply now** | P0-2 toast memo, P1-2 remove dep, P2-2 stable ref, P2-3 dead code | Very low | typecheck + lint |
| **2 — apply + verify** | P1-1 React Compiler | Low-med | healthcheck (already green) + device smoke test |
| **3 — needs a decision** | P0-1 virtualization, P1-3 card render passes | Medium | full manual pass over all 4 grids, both platforms |
| **4 — defer, measure first** | P1-4 tree shaking, P2-1 screen freezing | Medium+ | `EXPO_ATLAS` before/after; per-screen device trial |

Tier 3 is where the real performance is. It is also the only tier that changes UI-critical code, and it adds a runtime dependency that hard-requires Fabric.

---

## Phase 5 — What was applied, and how it was verified

Tiers 1–3 are **applied**. Tier 4 is **not** — it is left documented above.

| Issue | Change | Files |
|---|---|---|
| P0-2 | `useMemo` the toast context value | `lib/toast.tsx` |
| P1-2 | Removed unused `lucide-react-native` | `package.json`, `package-lock.json` |
| P2-2 | Stable `EMPTY_PRICE_DROPS` reference | `app/(tabs)/index.tsx` |
| P2-3 | Deleted dead `SectionEyebrow` | `components/AnonCards.tsx` |
| P1-1 | `experiments.reactCompiler: true` | `app.config.js` |
| P1-3 | `width` prop replaces `onLayout` measure; first-run guard on the `likeCount` effect | `components/ListingCard.tsx` |
| P0-1 | FlashList v2 on all four grids | `app/(tabs)/index.tsx`, `app/(tabs)/discover.tsx`, `app/(tabs)/profile.tsx`, `app/user/[id].tsx` |

### How the virtualization was done, and why this shape

Each of the four screens wraps its grid in a scroll view that also carries a
header, chips, rails, and tab panels. Rather than restructure those trees, the
existing tree became `ListHeaderComponent` and **only the grid rows moved into
FlashList's `data`**. That is safe here because of a property that holds on all
four screens: **the grid is always the last element rendered in its branch**, so
"header, then rows" puts the rows exactly where the inline grid was.

Two deliberate choices, both trading a little theoretical throughput for a lot of
certainty:

1. **Rows are the list item, `numColumns` stays 1.** `data` is `Listing[][]`, and
   each row renders the same flex-row with the same fixed `cardWidth` the old
   code used. The grid is therefore pixel-identical — the wrapper's
   `paddingHorizontal` moved onto the row and its vertical `gap` became a
   `marginBottom`. Using flat data with `numColumns={columns}` would recycle
   individual cells slightly better, but it would hand grid layout (and the
   padding/gap math) to FlashList on four screens with four different constants.
   Not worth the regression risk for the marginal gain.
2. **`ListHeaderComponent` is passed an element, never `() => <Header/>`.** An
   inline function is a new component type on every render, which remounts the
   header — that would drop focus from the search fields on Home and Discover on
   every keystroke. This is called out in a comment at each of the four sites.

**Follow-up — `components/WebRefresh.tsx` was subsequently deleted** (see the
"Web pull-to-refresh removal" section at the end of this document).

### Verification

Every gate below was run against the **actual changed tree**.

```
npx tsc --noEmit                → 0 errors
npx expo lint                   → 0 errors, 0 warnings   (baseline had 1 warning)
npx vitest run                  → 17 files, 155/155 passed
npx expo export -p web          → exit 0, bundle 5.1 MB
npx react-compiler-healthcheck  → 156/156 components compiled
```

**E2E, measured against a baseline rather than assumed.** The Playwright suite
runs against the static web export with Supabase fully mocked. The changed tree
was run, then the changes were stashed, the app was re-exported, and the identical
suite was run again on unmodified `feature/push-notifications`:

| | Passed | Failed |
|---|---|---|
| Baseline (stashed) | 124 | 35 |
| With these changes | 126 | 33 |

**Every one of the 33 failures under the changes is also present in the baseline
list — there are no new failures.** Two baseline failures
(`web-pull-refresh.spec.ts:35`, `signed-in/saved-searches.spec.ts:158`) did not
recur; they look like timing flakes and are *not* claimed as fixes here.

### ⚠️ Pre-existing: the E2E suite is substantially red on this branch

33 specs fail on unmodified `feature/push-notifications`, independent of any of
this work. They cluster into:

- `tab-navigation.spec.ts` + `responsive.spec.ts` — tab-bar locators, almost the
  whole `chromium-iphone-se` project
- `product-detail.spec.ts:25` — fails on all four viewport projects
- `network-failure.spec.ts` — three specs
- `signed-in/chat-inbox.spec.ts` — three specs

This matters beyond hygiene: a suite this red cannot detect a real regression,
which is why the stash-and-compare above was necessary to say anything
trustworthy about these changes. Worth its own pass.

### Rollback

Each item is independently revertible:

- **React Compiler** — delete `reactCompiler: true` from `app.config.js`.
- **FlashList** — `git revert` the four screen files; `components/ListingCard.tsx`'s
  `width` prop is optional and back-compatible, so it can stay either way.
- **Toast memo / dead code / unused dep** — one-line reverts, no coupling.

---

## Web pull-to-refresh removal (same day, follow-up)

### Why `refreshing`/`onRefresh` cannot solve this on web

The natural question is "FlashList and FlatList already have refresh — just use
it." They do, and it is already in use on all seven screens. It works on
iOS/Android. On web it is inert, and the chain is verifiable in installed source:

1. FlashList v2 constructs the control itself —
   `@shopify/flash-list/dist/recyclerview/hooks/useSecondaryProps.js:36`:
   ```js
   React.createElement(react_native_1.RefreshControl, { refreshing, progressViewOffset, onRefresh })
   ```
   `FlatList` does the same thing.
2. On web, Metro aliases `react-native` → `react-native-web@0.21.2`.
3. That package's entire `RefreshControl` implementation
   (`dist/exports/RefreshControl/index.js`) is:
   ```js
   function RefreshControl(props) {
     var colors = props.colors, enabled = props.enabled, onRefresh = props.onRefresh,
       refreshing = props.refreshing, tintColor = props.tintColor, /* …all of them… */
       rest = _objectWithoutPropertiesLoose(props, _excluded);
     return React.createElement(View, rest);   // every refresh prop discarded
   }
   ```
4. Upstream [necolas/react-native-web#1027](https://github.com/necolas/react-native-web/issues/1027)
   has been open since **July 2018** — milestone "TBD", no assignee, no PR.

No maintained library closes the gap either:
[`react-native-web-refresh-control`](https://www.npmjs.com/package/react-native-web-refresh-control)
(v1.1.2, ~2 yrs stale, open issue #11 *"Stuck on pull down release"*, and it
patches `FlatList` not FlashList);
[`react-simple-pull-to-refresh`](https://github.com/thmsgbrt/react-simple-pull-to-refresh)
(owns its own scroll container — incompatible with a virtualized list);
[`pulltorefreshjs`](https://www.npmjs.com/package/pulltorefreshjs) (5 yrs stale).

### What was removed, and why

`components/WebRefresh.tsx` (253 lines) hand-rolled the gesture with DOM
`touch`/`wheel` listeners. Two structural defects made it unstable:

1. **`setPull()` on every gesture event** (old lines 112, 142). The hook was
   called *inside each screen component*, so every frame of a pull re-rendered
   all of Home/Discover/Profile at gesture framerate.
2. **Listeners bound once on mount** (old line 61) behind a 10×100ms retry. If
   the scroll node appeared late or was later replaced, the gesture died with no
   recovery — and the FlashList migration made node replacement more likely.

Deleted: `components/WebRefresh.tsx`, `tests/e2e/web-pull-refresh.spec.ts`, and
the hook/indicator wiring from all seven screens. **Native `RefreshControl` is
untouched everywhere** — `refreshControl={...}` is still passed on all seven.
Mobile web now falls back to the browser's own pull-to-refresh, which the old
code actively suppressed via `e.preventDefault()`.

Tradeoff, stated plainly: **desktop web now has no in-app refresh affordance.**
There is no native browser pull gesture there. If that matters, a header Refresh
button calling the existing `onRefresh()` is the fix — it was offered and not
taken, so it is not implemented.

### Bug found and fixed during this work

`FlashListRef` exposes `scrollToOffset`, **not** `scrollTo`. Discover's four
scroll-to-grid jumps used `scrollRef.current?.scrollTo?.({ y, animated })` — the
optional call meant they silently did nothing after the FlashList migration
rather than throwing. This was a regression introduced by that migration and is
now corrected to `scrollToOffset({ offset, animated })` at
`app/(tabs)/discover.tsx` lines 478, 515, 535, 590.

### Verification

```
npx tsc --noEmit    → 0 errors
npx expo lint       → 0 errors, 0 warnings
npx vitest run      → 155/155 passed
npx expo export -p web → exit 0
```

E2E, same stash-and-compare discipline as above:

| | Total | Passed | Failed |
|---|---|---|---|
| Original baseline | 165 | 124 | 35 |
| After FlashList work | 165 | 126 | 33 |
| After this removal | **162** | 124 | **32** |

The 3-test drop is exactly `web-pull-refresh.spec.ts` (1 failing + 2 passing),
which was deleted with the feature. No new failures. Two specs
(`tmp-dummy-shot`, `saved-searches.spec.ts:158`) flip between runs, which
identifies them as flaky rather than as regressions.

### Still unmeasured

The gains argued in Phase 3 are mechanical (mounting ~1 viewport of rows instead
of 48–60) and the build/test gates confirm nothing broke — but **no on-device
frame timing or startup measurement was taken.** Before/after profiling on a
low-end Android device is the honest next step, along with
`EXPO_ATLAS=true npx expo export` if Tier 4 tree shaking is ever picked up.

---

## Feed scroll, pass 3 (2026-08-02)

Virtualization (P0-1) capped *how many* cards are alive; the earlier
`peekLikedIds` fix removed the extra render per card. What was left is the cost
of the card itself, paid on **every FlashList recycle** — which is precisely the
work that lands mid-scroll. All three items below are per-card-per-recycle, and
none of them changes a pixel.

| # | Change | File |
|---|---|---|
| 1 | Carousel slides mount lazily | `components/ListingCard.tsx` |
| 2 | Dropped the Reanimated wrapper around the card photo | `components/ListingCard.tsx` |
| 3 | Cached `Intl.NumberFormat`; skip the throwaway `new URL()` parse | `lib/currency.ts`, `lib/images.ts` |

### 1 — Multi-photo cards mounted every photo

A grid card is a thumbnail first and a gallery second, but the paging
`ScrollView` mounted one `expo-image` per photo unconditionally. A 4-photo
listing therefore built four native image views and fired four downloads for a
card the shopper may never swipe — times every card FlashList mounts and
re-mounts while scrolling, all competing with the *visible* photos for both the
JS thread and the connection pool.

Now only slide 0 is real; the rest render as empty slots **of the exact same
width**, so paging geometry, dot count, and scroll offsets are identical from
the first frame — only the pixels arrive later. `onTouchStart` hydrates the rest
on finger-down, before the drag produces any movement, so the images are
requested well before the swipe lands.

Two invariants keep this honest on a recycled card:

- A slide is also rendered real when `i === activeIndex`, so an instance parked
  mid-carousel never shows an empty slot.
- The `[listing.id, user?.id]` effect resets the hydrated flag. Cards that were
  never swiped are already `false` and React bails out of the unchanged
  setState, so this costs a render only on cards the shopper actually opened.

**Tradeoff, stated plainly:** the second photo now starts loading at finger-down
rather than at card mount. On a cold cache a fast swiper can meet a blank slide
for a moment. That is the price of not spending 3–5× the image budget on photos
nobody looks at, and it is the right trade for a browsing grid.

### 2 — `Animated.createAnimatedComponent(Image)` with nothing animated

`ListingCard` wrapped every photo in a Reanimated animated component and then
passed it a plain style object — no shared value, no animated style, ever. The
wrapper was pure overhead: a Reanimated-managed component plus its props node,
per photo, per card, per recycle. Now it uses `expo-image` directly, with a
comment at the import so it does not get "restored".

`app/product/[id].tsx` has the same wrapper and is **left alone** — that is the
hero carousel, a different screen with a different scroll story, and out of
scope for a feed-scroll pass.

### 3 — Two hot helpers doing native work per render

- **`formatPrice`** used `Number.prototype.toLocaleString('en-US', …)`, which
  constructs a fresh formatter on every call — on Hermes a JSI hop into the
  platform number formatter (ICU on Android, Foundation on iOS). It runs **three
  times per card render** (accessibility label, item price, total). Three
  `Intl.NumberFormat` instances are now built lazily and reused. Output parity
  was checked across 18 value/option combinations before the swap; falls back to
  the old per-call API if an engine has no `Intl`.
- **`getOptimizedImageUrl`** ran `new URL(url)` on every image on every render,
  then — with the Supabase transform flag off, which is the default — returned
  the original string unchanged. A two-`String.includes` guard now short-circuits
  before the parse. Every documented case still reaches the code it did before;
  `lib/images.test.ts` covers both flag states and is unchanged.

### Verification

```
npx tsc --noEmit          → 0 errors
npx expo lint             → 0 errors, 0 warnings
npx vitest run            → 17 files, 155/155 passed
npx expo export -p web    → exit 0, bundle 4.81 MB
```

One trap worth recording: the **first** `expo export` after this failed with
`TypeError: dependencies is not iterable`. That is a stale incremental Metro
graph, not a code fault — removing the `react-native-reanimated` import from
`ListingCard` desyncs the cached module graph. `npx expo export -p web --clear`
succeeds. Clear the cache before believing that error.

E2E was **not** re-baselined for this pass. The suite is red for unrelated
reasons (see above), no spec asserts carousel or image behaviour, and nothing
here changes layout or the DOM shape — so a stash-and-compare run would have
produced noise, not signal.

### Still open

- **Nothing here is measured on-device.** Same caveat as the pass above, and it
  is now the binding constraint: the remaining candidates cannot be ranked
  without a trace.
- **FlashList `drawDistance`** is at its 250 default while a grid row is roughly
  310px tall, so a fast flick can outrun the buffer. Raising it trades more
  mount work for fewer blank cells — exactly the trade that needs a measurement
  to settle, especially now that mount work per card is cheaper.
- **`PopIcon` costs 3 Reanimated nodes + 2 icon glyphs per card.** Both layers
  must stay mounted for the cross-fade, so there is no free win — it would be a
  design change, not an optimization.

---

## Pass 4 (2026-08-02) — React Compiler was silently off on the hot path

### The finding

`experiments.reactCompiler: true` has been set since Pass 1, and the
`react-compiler-healthcheck` run recorded above ("156 out of 156 components") was
read as proof it was working. It is not the same thing. The healthcheck reports
whether components *could* compile in principle; it does not run the plugin the
way `babel-preset-expo` runs it in a build.

Running the real plugin over the real tree tells a different story. The two most
expensive components in the app were getting **zero** compiler memoization:

| File | Compiled | Bailed |
|---|---|---|
| `components/ListingCard.tsx` | **0** | `try/finally` |
| `app/product/[id].tsx` | **0** | `try/finally` ×4 |
| `app/(tabs)/discover.tsx` | 7 skeletons | `DiscoverScreen` — `try/finally` |
| `app/(tabs)/profile.tsx` | 11 | `ProfileScreenInner` — memo dep mismatch |
| `app/(tabs)/chat.tsx` | 6 | `InboxScreen` — eslint-disable |
| `lib/toast.tsx` | `useToast` only | `ToastProvider` — ref during render |
| `lib/auth.tsx` | `useAuth` only | `AuthProvider` — memo dep mismatch |

`ToastProvider` and `AuthProvider` wrap the entire application.

### Why it is invisible

`babel-preset-expo` runs the plugin with `panicThreshold: 'NONE'` in production.
A component the compiler cannot lower is skipped **silently** — no warning, no
build failure, nothing visible in the bundle unless you go looking. And a bailout
is per-component, not per-function: one unsupported statement anywhere inside a
component body forfeits memoization for that entire component.

### How to check it (do this after touching any pattern below)

`react-compiler-healthcheck` is not sufficient. Run the plugin directly with a
logger. `babel-preset-expo` cannot be used for this — it needs Metro's
`supportsReactCompiler` caller flag, and it swallows the diagnostics anyway:

```js
babel.transformSync(src, {
  filename: file,
  presets: [[require('@babel/preset-typescript'), { isTSX: true, allExtensions: true }]],
  plugins: [[require('babel-plugin-react-compiler'), {
    target: '19',
    logger: { logEvent(_f, e) { console.log(e.kind, e.fnName, e.detail?.options?.reason); } },
  }]],
});
```

`CompileSuccess` events name the components that made it; `CompileError` gives
the reason and the line.

### The patterns that bail out, and what to write instead

These are limitations of `babel-plugin-react-compiler@1.0.0`, not code smells in
themselves. None of the rewrites change behaviour.

1. **`try { … } finally { … }`** — *"Handle TryStatement with a finalizer"*. Move
   the finalizer body after the `try/catch`. Only equivalent when neither block
   does `return`/`break`/`continue` or re-throws — **verify that each time**.
   Where an early `return` existed, it was restructured into a result variable
   and a single exit path.

2. **Value blocks inside `try`/`catch`** — *"Support value blocks (conditional,
   logical, optional chaining, etc) within a try/catch statement"*. `?.`, `??`,
   `?:`, `&&`, `||` are all forbidden in those bodies. Hoist them above the
   `try`, or call a helper. `lib/errors.ts` was added for the common case
   (`errorMessage`, `isAbortError`) so catch clauses stay bare.

3. **`throw` inside `try/catch`** — *"Support ThrowStatement inside of
   try/catch"*. `app/conversation/[id].tsx` used `throw new Error('insert
   returned no row')` to funnel a falsy result into its own catch; that is now a
   branch on the result.

4. **Refs touched during render** — *"Cannot access refs during render"*. Two
   shapes, both common here:
   - `someRef.current = value` in the component body → sync inside a `useEffect`.
   - `useRef(new Animated.Value(0)).current` → `useState(() => new Animated.Value(0))`.
     Independently a small real win: the `useRef` form constructs an
     `Animated.Value` on *every* render and discards all but the first, while the
     lazy initializer runs once.

5. **`useCallback`/`useMemo` dependency mismatch** — *"Existing memoization could
   not be preserved … Inferred less specific property than source"*. This one is
   a genuine correctness signal, not a quirk. Reading `user.id` in a body whose
   dep list says `user?.id` makes the compiler infer the whole object. Narrow
   once (`const userId = user?.id ?? null`) and depend on the primitive. In
   `app/conversation/[id].tsx` this is also strictly more precise: those
   callbacks no longer churn when an unrelated field of `conv` changes on every
   incoming realtime event.

And one real latent bug the suppressions were hiding: `app/(tabs)/chat.tsx`
assigned `activeTabRef.current = activeTab` during render. Both of that file's
`eslint-disable react-hooks/exhaustive-deps` comments are now gone — the compiler
refuses to optimize any component where a React ESLint rule was disabled, so a
suppression costs the whole screen its memoization.

### Result

`app/` + `components/`: **193 → 202 components compiled, 23 → 16 files with
bailouts**, and every remaining bailout is on a cold screen (`settings`, `login`,
`onboarding`, `payment`, `invoice`, `news`, `ratings`, `wardrobe/new`,
`profile/edit`, `conversation/new`) or a Reanimated shared-value writer.

**The Reanimated ones are deliberately left alone.** `AnimatedTabBar`,
`PressableScale`, `OfferSheet` and `SlideToConfirm` bail with *"This value cannot
be modified"* on `sharedValue.value = …`. Hoisting the handlers into `useCallback`
was tried on `PressableScale` and does **not** fix it — the limitation is the
write itself, and the experiment was reverted. It costs little regardless:
`AnimatedTabBar` is explicitly built so interaction never re-renders React at
all, so there is almost no render work there to memoize.

---

## Pass 4, part 2 — list tuning, the last unvirtualized grid, the card carousel

### `drawDistance` — the Pass 3 open item, now closed

`lib/responsive.ts` exports `GRID_DRAW_DISTANCE = 700`, applied to all four
listing grids plus the new wardrobe grid. The geometry, so it isn't a magic
number: on a 390pt phone the grid is 2 columns → card 179pt wide → photo 238pt
tall (aspectRatio 1/1.33) + ~76pt text + 24pt margins ≈ **338pt per row**.
FlashList's default of 250 is less than a single row, so a flick outran the
buffer. 700 buys ~2 rows of runway. This is the trade Pass 3 flagged as needing a
decision; it is worth taking *now* precisely because Pass 3 cut the per-card
mount cost first.

### FlatList tuning — there was none anywhere in the app

A grep for `windowSize|initialNumToRender|maxToRenderPerBatch|removeClippedSubviews|getItemType|drawDistance`
returned **no matches** across the entire codebase before this pass. Now set on
the inbox (`chat.tsx`) and both follow lists.

`app/(tabs)/chat.tsx` also had `ItemSeparatorComponent={() => …}` — a new
component *type* every render, which unmounts and remounts every separator — and
handed `InboxRow` a fresh `onPress` closure, defeating the `memo` it already had.
Both fixed (`InboxSeparator`, and `InboxListRow` owns the navigation).

### `fetchFollowers` / `fetchFollowing` were unpaginated — now fixed

`lib/follows.ts` had no `.limit()` and no pagination on either list: a seller
with 5,000 followers pulled all 5,000 edge rows plus a profile join for each,
before a single name rendered. The list tuning above bounds the *rendering* cost
and can do nothing about the query.

Both now page at `FOLLOW_PAGE_SIZE = 30` through a shared `fetchFollowPage`
helper, with `useFollowersQuery` / `useFollowingQuery` converted from `useQuery`
to `useInfiniteQuery` (same shape as `useHomeFeedQuery`) and both screens wired
to `onEndReached` with a footer spinner.

Choices worth recording:

- **Offset paging via `.range()`, not a `created_at` keyset**, to match the
  convention `lib/listings.ts` already uses. The tradeoff is the standard one: a
  follow added while the reader is mid-scroll shifts the window and can repeat or
  skip a row at a page boundary. Acceptable for a follow list; switch to a keyset
  on `(created_at, id)` if it ever isn't.
- **`isRefetching` had to be gated on `!isFetchingNextPage`.** It is true during
  `fetchNextPage` too, so without that the pull-to-refresh control spun every
  time the reader hit the bottom.
- **The follow mask still covers every loaded id**, so it refetches as pages
  accumulate. `placeholderData: (prev) => prev` keeps rows from flashing back to
  "Follow" during that refetch. One `.in()` query per page is cheap enough to
  leave alone.

Covered by `lib/follows.test.ts` (8 tests): the range window per page, the
`follower_id`/`followee_id` direction of each list, edge-order preservation
across the profile join, missing-profile rows being dropped rather than left as
holes, and an empty page skipping the profile round-trip (an empty `.in()` would
otherwise match every profile).

### `WardrobeGrid` was the last unvirtualized grid

`app/(tabs)/wardrobe.tsx` rendered `posts.map(...)` inside a plain `ScrollView`.
Converted to the same row-virtualized FlashList shape as the other four grids.

The parent `ScrollView` had to be **removed**, not kept: a FlashList nested in a
ScrollView gets unbounded height and silently mounts every row, which would have
made the change worthless. The padding moved to props.

### The card carousel now scrolls on the UI thread

`ListingCard`'s photo carousel used a plain `onScroll` at
`scrollEventThrottle={16}` — a JS-thread callback every frame of every swipe, on
a card inside a feed that is itself scrolling and recycling. It is now
`useAnimatedScrollHandler` writing a shared value, with the dots reading it in
`useAnimatedStyle`, so a swipe repaints without any React render. The JS thread
is crossed once per *page change* via `useAnimatedReaction`, only because
`activeIndex` still gates which slides mount for real (the Pass 3 lazy-slide
invariant).

The dots look exactly as before — 5px, solid white on the current page, 55% white
otherwise. Only the mechanism moved.

### Considered and rejected: prefetching the product hero on card press

The idea was that tapping a card should warm the full-size hero image. It would
be dead code. Listing photos are Supabase storage public URLs and
`EXPO_PUBLIC_SUPABASE_IMAGE_TRANSFORM` is off by default, so
`getOptimizedImageUrl` returns the **identical** URL for the card and the hero —
expo-image already holds it in its memory-disk cache. Worth revisiting only if
that transform flag is ever switched on.

### Still open after this pass

- **Still nothing measured on-device.** Every claim above is mechanical (fewer
  mounted views, fewer renders, work moved off the JS thread) and gated by
  typecheck/lint/tests/export — but no frame timing or startup trace was taken.
  Four passes in, this is now the binding constraint: what remains cannot be
  ranked without a trace.
- **Cold screens without compiler coverage** — `settings.tsx` alone has 10
  bailouts. All the same mechanical patterns; low value because those screens
  render once.

### Pass 4 verification

```
npx tsc --noEmit          → 0 errors
npx expo lint             → 0 errors, 0 warnings
npx vitest run            → 19 files, 172/172 passed
npx expo export -p web    → exit 0
npx react-compiler (sweep)→ 205 components compiled, 16 files bailing
```

E2E, with the same stash-and-compare discipline as the earlier passes — the tree
was reverted to the parent commit, re-exported, and the identical suite run to
establish the baseline:

| | Passed | Failed | Skipped |
|---|---|---|---|
| Baseline (parent commit) | 124 | 32 | 6 |
| With Pass 4 | 126 | 30 | 6 |

The failing **sets** were diffed, not just the counts. **Zero new failures.**

Two baseline failures did not recur — `network-failure.spec.ts:80` ("slow
network (3s delay)") and `signed-in/saved-searches.spec.ts:158`. **Neither is
claimed as a fix.** Both are timing-sensitive, the second is already recorded as
flaky earlier in this document, and intermediate runs of the *same* tree scored
124/32 and 126/30 — the counts move without the code moving. Zero-new is the
only trustworthy signal a suite this red can produce.

### Correctness audit of the rewrites (and three defects it caught)

Every gate above was green *before* this audit, and the audit still found three
real defects. Re-deriving each control-flow rewrite path-by-path against its
original is what caught them; the gates could not have.

1. **`isAbortError` silently stopped recognising cancellations.** It was written
   as `e instanceof Error && e.name === 'AbortError'`, replacing hand-written
   `e?.name === 'AbortError'` checks. Fetch aborts reject with a **DOMException**,
   which is not reliably `instanceof Error`. The reachable case: supabase's
   `timeoutFetch` aborts its *own* controller at 12s, so the caller's signal
   reads un-aborted and the `instanceof` test misses — `product/[id].tsx` would
   show "Could not load listing" where it previously stayed silent. Both helpers
   now read `.name`/`.message` structurally; `lib/errors.test.ts` pins it,
   including an explicit `expect(domExceptionLike instanceof Error).toBe(false)`.

2. **`WardrobeGrid` would not have scrolled or virtualized at all.** Dropping the
   parent `ScrollView` left the FlashList as one sibling among three in a
   `flex: 1` column, and a flex child with no flex style sizes to its *content* —
   unbounded height, no scrolling, every tile mounted. It now wraps itself in
   `flex: 1`.

3. **Paging could strand the follow button** — a defect *introduced by* the
   pagination work. `useToggleFollowInList` captured the mask cache key including
   the `ids` array; `ids` grows as pages load, and `onEndReached` fires exactly
   where a reader taps Follow. A page landing mid-flight changed the active key,
   leaving the optimistic write on an entry nothing read and snapping the button
   back. It now writes through the `qk.followingMaskScope` prefix with
   `setQueriesData`, which is correct regardless of paging.

Two intentional non-equivalences, both strict improvements, recorded so they are
not mistaken for drift: `errorMessage(e) || fallback` also falls back on an empty
string (the old `e?.message ?? fallback` would show a blank toast), and
`handleShareProfile` previously did `error.message` with no optional chaining,
which would itself throw on a null rejection.


---

## Pass 5 (2026-08-02) — the first measurements, and what they overturned

Every pass before this one reasoned about performance and verified with build
gates. This one used Chrome's own metrics. Two harnesses, both kept in the
session scratchpad rather than the repo:

- **INP / long tasks** — drives scripted interactions, records
  `PerformanceEventTiming` plus every long task, and takes a CDP CPU profile
  over each click. Supports `CPU_THROTTLE` and signed-in storage state.
- **LCP / CLS** — records the LCP element (with its URL and load/render split)
  and every layout shift *with its `sources`*, i.e. which nodes moved.

### The measurements immediately falsified two of my own hypotheses

1. **"The reported INP of 1272ms must be a dev build."** Wrong: dev measured
   168ms against production's 144ms. The real cause was ~4x CPU throttling —
   reproduced by setting `Emulation.setCPUThrottlingRate: 4`, which matched the
   reported distribution including a 616ms interaction to the millisecond.
2. **"The Discover fix works / doesn't work."** A single 1x sample said 280 →
   144ms; a single 4x sample said unchanged. Both were noise: product navigation
   swung 144 → 216 → 1048ms across runs of identical code. Only repeated
   **cold-load** sampling settled it (see below). Sampling must be cold, because
   a second sheet open hits the Query cache and measures a different path.

### Results

| Metric | Before | After |
|---|---|---|
| Discover sheet open (median of 5 cold loads @4x) | 912ms | **656ms** |
| — spread across those 5 | 816–1024ms | **640–664ms** |
| CLS, signed out | 0.000 | **0.000** |
| CLS, signed in | 0.030 | **0.000** |

**Discover** — `DeferAfterPaint` mounts the sheet body one *painted* frame after
the shell. Two nested `requestAnimationFrame`s, not one: a single rAF scheduled
from an effect still runs before the next paint, landing the body in the very
frame being kept clear. The 240ms slide covers the gap.

**CLS** — the shift was the home screen's two cold-start banners deciding late.
The follow CTA's condition is accidentally *true* while loading rather than
merely unknown (`listings` is the stable empty array and `[].every(...)` is
`true`), so it rendered on every visit and then vanished, dropping the grid 74px.

Gating it on settled inputs alone was **not** enough, and measuring both audiences
is what caught why: it merely moved the shift onto signed-out visitors. The real
cause was structural — `app/_layout.tsx` did `if (!ready) return null` *above*
the provider tree, so `AuthProvider` could not begin reading the session until
the fonts resolved (~1.3s) and auth was guaranteed to settle after first paint.
The gate now wraps only the `<Stack>`; providers mount immediately and auth
overlaps the font load. That is also a startup win in its own right.

---

## Pass 5, part 2 — image payload, the largest finding in five passes

`LCP 7.0s` reported, reproduced locally at 8.5s. The LCP element is a listing
photo, and the image itself accounted for 8173ms of it. Auditing the feed's
network traffic:

**One feed screen requested 20.30 MB of images.** Largest single file: 6.0 MB.
Natural dimensions up to **4284x5712 for a 194x258 tile — a 22x oversample.**

Two distinct causes, and they need different fixes:

1. **Legacy uploads.** `lib/upload.ts` already compresses to 1440px @ q0.7, and
   the 1080–1103x1440 files match that. The 4284x5712 ones predate it. Not a
   code bug — un-backfilled data.
2. **Even correct uploads are ~8.7x oversampled.** A 1440px file (~260 KB) is
   downloaded for a tile that wants 291px (~30 KB), because
   `getOptimizedImageUrl` returns Supabase URLs unchanged while the transform
   flag is off. `thumbWidthFor()` computes a width that is never applied. This
   one is permanent and applies to every future upload.

### Why not Supabase image transformations

They are a **Pro-plan feature**, billed per 1,000 origin images. Verified live
against this project on 2026-08-02:

```
ORIGINAL     HTTP 200  374 KB  image/jpeg
TRANSFORMED  HTTP 403  {"error":"FeatureNotEnabled",
                        "message":"feature not enabled for this tenant"}
```

⚠️ `EXPO_PUBLIC_SUPABASE_IMAGE_TRANSFORM=true` therefore **breaks every image in
the app** on this project, because `lib/images.ts` rewrites every `.supabase.co`
URL to that 403ing endpoint. The flag is set to `false` with that finding
recorded inline. Turn it on only after the project is on Pro.

### What was built instead: `listings.thumbnails`

Sizes are generated once at upload rather than per request.

| Piece | Where |
|---|---|
| `thumbnails text[]`, nullable, index-aligned with `images` | `supabase/migrations/20260802134206_add_listing_thumbnails.sql` |
| 640px long edge @ q0.72 (~40–70 KB vs ~260 KB) | `lib/upload.ts` |
| `cardImageUrl()` — thumb, else full, else empty | `lib/images.ts` |
| Card + carousel read through it; hero/fullscreen keep full size | `components/ListingCard.tsx` |

Decisions worth keeping:

- **640 on the long edge**, so a portrait 3:4 photo is 480x640 — the 480px width
  clears the widest realistic tile (a 4-column tablet grid wants 432px) while a
  phone gets ~1.6x what it displays.
- **The thumbnail is derived from the already-compressed 1440px copy**, not the
  original, so a phone doesn't decode a 12 MP file twice.
- **A failed thumbnail never fails a listing** — it falls back to the full-size
  URL, which is exactly what pre-column rows already do.
- **Index alignment is safe** because `listings.images` is written once at insert
  and never mutated afterwards (the only later UPDATE is `is_sold`). Any future
  image-editing flow must write both arrays together.
- **Thumbnail deletion is a separate `storage.remove()` call whose error is
  swallowed**, so the code does not depend on how the API reports
  partially-missing prefixes — most `_thumb` paths won't exist for old rows.

### ⚠️ Deploy ordering is now load-bearing

`lib/listings.ts` names `thumbnails` in the feed column list. Until the migration
is applied, PostgREST rejects the **entire** feed request with
`42703 column listings.thumbnails does not exist` and the app renders zero
listings. **Migration first, then the client build.**

This was not theoretical — it happened during this pass. Every gate was green
(tsc 0, lint 0, 184 tests, successful export) because none of them touch the live
schema; the breakage was found only because the image audit reported
`0 image requests`. Build gates cannot catch a schema/client mismatch.

### Still open

- **The 5x saving is unproven end to end.** `cardImageUrl` and `thumbPathFor`
  have unit coverage, but thumbnail *generation* needs a real photo through
  `expo-image-manipulator` (native) or canvas (web). The first listing created
  after this ships should be checked for a populated `thumbnails` array and a
  `_thumb` object in storage.
- **Existing rows are unchanged** — all `thumbnails` are NULL, so LCP is
  unmoved until content is re-uploaded or backfilled.
- **`tests/e2e/tmp-dummy-shot.spec.ts`** is marked TEMP, asserts nothing, and
  screenshots into a scratchpad path from a deleted session. It flakes. Delete it.
