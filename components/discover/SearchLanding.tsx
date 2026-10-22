// Discover's search panel body, rendered inside the search sheet
// (components/discover/DiscoverSheet.tsx).
//
// Layout follows a music-picker style list: one row of tab chips, then a
// single-column list of rows (thumbnail · title · subtitle · trailing icon).
//
//   For you   — the live category taxonomy, each row fronted by a real cover
//               shot from that category (falling back to its Feather icon).
//   Trending  — the top popular listings, ranked, with a "New" tag on fresh
//               ones. A trailing row opens the full popular sort.
//   The rest  — catalog sorts and hub destinations; they navigate away.
//
// Presentational: every tap emits a typed action the host applies. Deliberately
// un-animated — it mounts inside a sheet that is already sliding up.

import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import { View, Pressable, ScrollView, Platform } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { cardImageUrl, getOptimizedImageUrl, IMAGE_TRANSITION } from '@/lib/images';
import { CATEGORIES, type CategoryId } from '@/lib/categories';
import { formatPrice } from '@/lib/currency';
import { radii, type } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import type { SortKey } from '@/lib/listings';
import type { Listing } from '@/types';
import type { DiscoverTab } from './SearchTabs';

function haptic() {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

const PAD = 16;
const THUMB = 56;
const NEW_MS = 72 * 60 * 60 * 1000;
const TREND_UP = '#22C55E';
const TREND_DOWN = '#EF4444';

type Move = 'up' | 'down' | 'same' | 'new';

// Movement against the server's rank snapshot from ~24h ago (pg_cron, hourly —
// supabase/migrations/20261022110000_trending_rank_snapshots.sql). Rows
// missing from the snapshot are new to the chart.
export function rankMoves(trending: Listing[], baseline: Record<string, number>): Record<string, Move> {
  const moves: Record<string, Move> = {};
  trending.forEach((l, i) => {
    const was = baseline[l.id];
    moves[l.id] = was == null ? 'new' : was > i + 1 ? 'up' : was < i + 1 ? 'down' : 'same';
  });
  return moves;
}

// ── Actions ─────────────────────────────────────────────────────────────────
export type BrowseAction =
  | { kind: 'sort'; sort: SortKey }
  | { kind: 'tab'; tab: DiscoverTab }
  | { kind: 'saved' };

export type TopicAction = { kind: 'category'; category: CategoryId } | { kind: 'all' };

type ChipDef = {
  id: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  /** Absent = an in-panel tab that swaps the list below instead of navigating. */
  action?: BrowseAction;
};

const TABS: ChipDef[] = [
  { id: 'foryou', label: 'For you', icon: 'star' },
  { id: 'trending', label: 'Trending', icon: 'trending-up' },
  { id: 'saved', label: 'Saved', icon: 'bookmark', action: { kind: 'saved' } },
  { id: 'new', label: 'New', icon: 'zap', action: { kind: 'sort', sort: 'newest' } },
  { id: 'cheapest', label: 'Lowest price', icon: 'arrow-down', action: { kind: 'sort', sort: 'price_asc' } },
  { id: 'aesthetics', label: 'Aesthetics', icon: 'hash', action: { kind: 'tab', tab: 'aesthetics' } },
  { id: 'brands', label: 'Brands', icon: 'award', action: { kind: 'tab', tab: 'brands' } },
  { id: 'sellers', label: 'Sellers', icon: 'users', action: { kind: 'tab', tab: 'users' } },
];

const TRENDING_ALL: ChipDef = {
  id: 'trending',
  label: 'Trending',
  icon: 'trending-up',
  action: { kind: 'sort', sort: 'popular' },
};

type TopicDef = {
  id: string;
  label: string;
  sub: string;
  icon: keyof typeof Feather.glyphMap;
  action: TopicAction;
};

const TOPICS: TopicDef[] = [
  ...CATEGORIES.map((c) => ({
    id: c.id,
    label: c.label,
    sub: c.subs.slice(0, 3).map((s) => s.label).join(' · '),
    icon: c.icon,
    action: { kind: 'category', category: c.id } as TopicAction,
  })),
  { id: '__all', label: 'All items', sub: 'The full catalog', icon: 'grid', action: { kind: 'all' } },
];

// ── Panel ───────────────────────────────────────────────────────────────────
export function SearchLanding({
  covers,
  trending,
  baseline,
  onBrowse,
  onTopic,
  onListing,
  activeChipId,
}: {
  /** category id → a live cover shot, so rows show real stock, not clip art. */
  covers: Partial<Record<string, string>>;
  /** Popular listings, best first. `undefined` while loading. */
  trending: Listing[] | undefined;
  /** listing id → rank in the ~24h-old snapshot. `undefined` while loading. */
  baseline: Record<string, number> | undefined;
  onBrowse: (action: BrowseAction, chip?: ChipDef) => void;
  onTopic: (action: TopicAction, topic?: TopicDef) => void;
  onListing: (id: string) => void;
  activeChipId?: string | null;
}) {
  const moves = useMemo(
    () => (trending && baseline ? rankMoves(trending, baseline) : {}),
    [trending, baseline],
  );
  const [tab, setTab] = useState<'foryou' | 'trending'>(
    activeChipId === 'trending' ? 'trending' : 'foryou',
  );

  const onChip = useCallback(
    (chip: ChipDef) => {
      haptic();
      if (chip.action) onBrowse(chip.action, chip);
      else setTab(chip.id as 'foryou' | 'trending');
    },
    [onBrowse],
  );

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: PAD, gap: 8, paddingTop: 16, paddingBottom: 8 }}
      >
        {TABS.map((c) => (
          <TabChip
            key={c.id}
            chip={c}
            selected={c.action ? activeChipId === c.id : tab === c.id}
            onSelect={onChip}
          />
        ))}
      </ScrollView>

      {tab === 'foryou'
        ? TOPICS.map((t) => (
            <TopicRow key={t.id} topic={t} cover={covers[t.id]} onSelect={onTopic} />
          ))
        : (
          <>
            {trending
              ? trending.map((l, i) => (
                  <TrendingRow key={l.id} rank={i + 1} listing={l} move={moves[l.id]} onSelect={onListing} />
                ))
              : Array.from({ length: 6 }, (_, i) => <PlaceholderRow key={i} />)}
            <SeeAllRow onPress={() => onBrowse(TRENDING_ALL.action!, TRENDING_ALL)} />
          </>
        )}
    </View>
  );
}

// ── Tab chip ────────────────────────────────────────────────────────────────
// 30px squircle chip (borderRadius 8), Paper White resting / Solid Ink active
// (UI_GUARDRAILS §3). Press feedback stays on transform + background only.
const TabChip = memo(function TabChip({
  chip,
  selected,
  onSelect,
}: {
  chip: ChipDef;
  selected: boolean;
  onSelect: (chip: ChipDef) => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={() => onSelect(chip)}
      accessibilityRole="button"
      accessibilityLabel={`Browse ${chip.label.toLowerCase()}`}
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 30,
        paddingHorizontal: 14,
        // Squircle, not pill — approved exception (UI_GUARDRAILS §3).
        borderRadius: 8,
        borderWidth: 1,
        borderColor: selected ? theme.ink : theme.border,
        backgroundColor: selected ? theme.ink : pressed ? theme.surface : theme.panel,
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}
    >
      <Text
        style={{
          fontSize: 13,
          fontFamily: type.family.sansBold,
          color: selected ? theme.background : theme.ink,
          letterSpacing: -0.2,
        }}
      >
        {chip.label}
      </Text>
    </Pressable>
  );
});

// ── Rows ────────────────────────────────────────────────────────────────────
function Row({
  onPress,
  label,
  leading,
  thumb,
  title,
  subtitle,
}: {
  onPress: () => void;
  label: string;
  leading?: ReactNode;
  thumb: ReactNode;
  title: string;
  subtitle: ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingHorizontal: PAD,
        paddingVertical: 8,
        backgroundColor: pressed ? theme.surface : 'transparent',
      })}
    >
      {leading}
      {thumb}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text
          numberOfLines={1}
          style={{ fontSize: 15, fontFamily: type.family.sansBold, color: theme.ink }}
        >
          {title}
        </Text>
        {subtitle}
      </View>
      <Feather name="chevron-right" size={18} color={theme.muteSoft} />
    </Pressable>
  );
}

function Thumb({ uri, icon }: { uri: string | null; icon: keyof typeof Feather.glyphMap }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        width: THUMB,
        height: THUMB,
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: theme.purpleSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Icon is a layer under the photo, so a slow or broken image degrades
          to the icon instead of an empty square. */}
      <Feather name={icon} size={20} color={theme.purple} />
      {uri ? (
        <Image
          source={{ uri }}
          // Radius repeated on the image: Android doesn't reliably clip an
          // absolute child to a rounded parent's overflow: hidden.
          style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: 8 }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={IMAGE_TRANSITION}
        />
      ) : null}
    </View>
  );
}

function Subtitle({ children, trend }: { children: string; trend?: boolean }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      {trend ? <Feather name="arrow-up-right" size={14} color={theme.mute} /> : null}
      <Text
        numberOfLines={1}
        style={{ flexShrink: 1, fontSize: 13.5, fontFamily: type.family.sans, color: theme.mute }}
      >
        {children}
      </Text>
    </View>
  );
}

const TopicRow = memo(function TopicRow({
  topic,
  cover,
  onSelect,
}: {
  topic: TopicDef;
  cover?: string;
  onSelect: (action: TopicAction, topic?: TopicDef) => void;
}) {
  return (
    <Row
      onPress={() => onSelect(topic.action, topic)}
      label={`Browse ${topic.label}`}
      thumb={<Thumb uri={cover ? getOptimizedImageUrl(cover, { width: 120 }) : null} icon={topic.icon} />}
      title={topic.label}
      subtitle={<Subtitle>{topic.sub}</Subtitle>}
    />
  );
});

const TrendingRow = memo(function TrendingRow({
  rank,
  listing,
  move,
  onSelect,
}: {
  rank: number;
  listing: Listing;
  move?: Move;
  onSelect: (id: string) => void;
}) {
  const { theme } = useTheme();
  const img = cardImageUrl(listing, 0);
  // An arrow wins when the row moved; "New" marks chart entries and fresh listings holding steady.
  const isNew =
    move === 'new' ||
    (move !== 'up' && move !== 'down' && Date.now() - new Date(listing.created_at).getTime() < NEW_MS);
  const who = listing.brand?.trim() || listing.seller?.username;
  return (
    <Row
      onPress={() => onSelect(listing.id)}
      label={`Trending #${rank}: ${listing.title}`}
      leading={
        <View style={{ width: 30, alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 15, fontFamily: type.family.sansBold, color: theme.ink }}>
            {rank}
          </Text>
          {isNew ? (
            <View
              style={{
                paddingHorizontal: 5,
                height: 16,
                justifyContent: 'center',
                borderRadius: radii.pill,
                backgroundColor: theme.purple,
              }}
            >
              <Text style={{ fontSize: 9.5, fontFamily: type.family.sansBold, color: '#FFFFFF' }}>
                New
              </Text>
            </View>
          ) : move === 'up' || move === 'down' ? (
            // Rank-movement arrows: approved green/red exception (UI_GUARDRAILS §3).
            <Feather
              name={move === 'up' ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={move === 'up' ? TREND_UP : TREND_DOWN}
            />
          ) : null}
        </View>
      }
      thumb={<Thumb uri={img ? getOptimizedImageUrl(img, { width: 120 }) : null} icon="image" />}
      title={listing.title}
      subtitle={
        <Subtitle trend>
          {[who, formatPrice(listing.price, { whole: true })].filter(Boolean).join(' · ')}
        </Subtitle>
      }
    />
  );
});

function PlaceholderRow() {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: PAD, paddingVertical: 8 }}>
      <View style={{ width: 30 }} />
      <View style={{ width: THUMB, height: THUMB, borderRadius: 8, backgroundColor: theme.surface }} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={{ width: '70%', height: 12, borderRadius: 6, backgroundColor: theme.surface }} />
        <View style={{ width: '45%', height: 10, borderRadius: 5, backgroundColor: theme.surface }} />
      </View>
    </View>
  );
}

function SeeAllRow({ onPress }: { onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="See all trending"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        marginTop: 8,
        paddingVertical: 12,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ fontSize: 14, fontFamily: type.family.sansBold, color: theme.ink }}>
        See all trending
      </Text>
      <Feather name="chevron-right" size={16} color={theme.ink} />
    </Pressable>
  );
}
