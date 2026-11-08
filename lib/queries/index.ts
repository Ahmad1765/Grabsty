// ─────────────────────────────────────────────────────────────────────────────
// CENTRAL QUERIES ENTRY POINT (RE-EXPORTS)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Facade / Barrel Pattern
// By exporting all domain query hooks and the centralized query key factory `qk`
// from this index, existing screen imports (`import { ... } from '@/lib/queries'`)
// remain 100% backwards-compatible without touching dozens of screen files.
//
// Behind the scenes, the monolithic file has been decoupled into single-responsibility
// domain modules:
//   - keys.ts               -> Centralized query keys
//   - useListingsQueries.ts -> Product listings, likes, saves
//   - useFeedQueries.ts     -> Home feed, price drops, saved searches
//   - useProfileQueries.ts  -> Profiles, follow states, followers/following
//   - useWardrobeQueries.ts -> Swipe deck, my wardrobe, liked wardrobe
//   - useChatQueries.ts     -> Inbox and chat threads
//   - usePaymentQueries.ts  -> Orders and payments
// ─────────────────────────────────────────────────────────────────────────────

export * from './keys';
export * from './useListingsQueries';
export * from './useFeedQueries';
export * from './useProfileQueries';
export * from './useWardrobeQueries';
export * from './useChatQueries';
export * from './usePaymentQueries';
