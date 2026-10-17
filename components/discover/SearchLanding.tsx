// Discover's search panel body — the BROWSE chip row and the TOPICS grid.
// Rendered by two hosts: the search sheet the Discover tab opens
// (components/discover/DiscoverSheet.tsx) and the Discover screen's own
// search-focus landing.
//
//   BROWSE  — outlined icon chips that wrap: three catalog sorts onto the
//             Items grid, the three hub tabs, and the user's saved searches.
//   TOPICS  — a two-column tile grid over the live category taxonomy, each
//             tile fronted by a real cover shot from that category (falling
//             back to the taxonomy's own Feather icon until one loads).
//
// Presentational: every tap emits a typed action the host applies. Deliberately
// un-animated — see the note on the entrance animation below.

import { memo, useCallback, useState, useEffect, useMemo } from 'react';
import { View, Pressable, Platform } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { getOptimizedImageUrl, IMAGE_TRANSITION } from '@/lib/images';
import { CATEGORIES, type CategoryId } from '@/lib/categories';
import { colors, radii, type } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import type { SortKey } from '@/lib/listings';
import type { DiscoverTab } from './SearchTabs';

function haptic() {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

const PAD = 16;
const GAP = 10;

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
  action: BrowseAction;
};

// Sorts first, then the hub destinations — one wrapping group, ordered so the
// row reads "how do I rank the catalog" → "where else can I look".
//
// The three sorts are real server-side orderings (lib/listings' SortKey, the
// same values the category grid's SORT row uses), not the editorial digest
// "themes" — that rail is switched off in Discover, so a chip pointing at it
// would land the user on a header they can't see the source of.
const BROWSE_CHIPS: ChipDef[] = [
  { id: 'new', label: 'New', icon: 'zap', action: { kind: 'sort', sort: 'newest' } },
  { id: 'trending', label: 'Trending', icon: 'trending-up', action: { kind: 'sort', sort: 'popular' } },
  { id: 'cheapest', label: 'Lowest price', icon: 'arrow-down', action: { kind: 'sort', sort: 'price_asc' } },
  { id: 'aesthetics', label: 'Aesthetics', icon: 'hash', action: { kind: 'tab', tab: 'aesthetics' } },
  { id: 'brands', label: 'Brands', icon: 'award', action: { kind: 'tab', tab: 'brands' } },
  { id: 'sellers', label: 'Sellers', icon: 'users', action: { kind: 'tab', tab: 'users' } },
  { id: 'saved', label: 'Saved', icon: 'bookmark', action: { kind: 'saved' } },
];

type TopicDef = {
  id: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  action: TopicAction;
};

// The taxonomy itself plus an "All items" tile — which both fills the grid to
// an even eight and gives the panel a one-tap way back to the full catalog.
const TOPIC_TILES: TopicDef[] = [
  ...CATEGORIES.map((c) => ({
    id: c.id,
    label: c.label,
    icon: c.icon,
    action: { kind: 'category', category: c.id } as TopicAction,
  })),
  { id: '__all', label: 'All items', icon: 'grid', action: { kind: 'all' } },
];

// ── Panel ───────────────────────────────────────────────────────────────────
export function SearchLanding({
  covers,
  onBrowse,
  onTopic,
  activeChipId,
}: {
  /** category id → a live cover shot, so tiles show real stock, not clip art. */
  covers: Partial<Record<string, string>>;
  onBrowse: (action: BrowseAction, chip?: ChipDef) => void;
  onTopic: (action: TopicAction, topic?: TopicDef) => void;
  activeChipId?: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(activeChipId ?? null);

  useEffect(() => {
    if (activeChipId !== undefined) {
      setSelectedId(activeChipId);
    }
  }, [activeChipId]);

  const handleSelectChip = useCallback(
    (action: BrowseAction, id: string) => {
      setSelectedId(id);
      const chip = BROWSE_CHIPS.find((c) => c.id === id);
      onBrowse(action, chip);
    },
    [onBrowse],
  );

  const handleSelectTopic = useCallback(
    (action: TopicAction) => {
      const topic = TOPIC_TILES.find((t) =>
        action.kind === 'all' ? t.id === '__all' : t.id === action.category,
      );
      onTopic(action, topic);
    },
    [onTopic],
  );

  // Group topics into pairs of two for a rock-solid, responsive 2-column grid.
  // Using explicit rows with flex: 1 eliminates subpixel rounding and Yoga flexWrap
  // bugs where calculated pixel widths overflow the row on devices with odd screen
  // widths or fractional DPRs (e.g. 393px iPhone 14/15/16 Pro, Pixel), which previously
  // caused every tile to wrap onto its own row in a single column.
  const topicRows = useMemo(() => {
    const rows: TopicDef[][] = [];
    for (let i = 0; i < TOPIC_TILES.length; i += 2) {
      rows.push(TOPIC_TILES.slice(i, i + 2));
    }
    return rows;
  }, []);

  return (
    <View style={{ paddingHorizontal: PAD, marginTop: 20 }}>
      <SectionLabel>Browse</SectionLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {BROWSE_CHIPS.map((c) => (
          <BrowseChipView
            key={c.id}
            chip={c}
            selected={selectedId === c.id}
            onSelect={handleSelectChip}
          />
        ))}
      </View>

      <View style={{ marginTop: 24 }}>
        <SectionLabel>Topics</SectionLabel>
        <View style={{ gap: GAP, marginTop: 10 }}>
          {topicRows.map((row, rowIdx) => (
            <View key={rowIdx} style={{ flexDirection: 'row', gap: GAP }}>
              {row.map((t) => (
                <TopicTile
                  key={t.id}
                  topic={t}
                  cover={covers[t.id]}
                  onSelect={handleSelectTopic}
                />
              ))}
              {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// Uppercase micro-eyebrow — the panel's only chrome, deliberately quiet so the
// chips and tiles carry the hierarchy. Same 11/1.4 uppercase eyebrow the
// editorial rails use, so anything rendered below stays in rhythm.
function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontFamily: type.family.sansBold,
        color: colors.mute,
        letterSpacing: 1.4,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </Text>
  );
}

// ── Browse chip ─────────────────────────────────────────────────────────────
// No entrance animation on purpose. These 15 nodes mount inside a sheet that
// is *already* sliding up, and per-item springs meant 15 concurrent animations
// competing with that transition on the frame the user is watching most
// closely. Press feedback stays on transform + a background swap — never a
// layout property — so it composites instead of triggering layout.
const BrowseChipView = memo(function BrowseChipView({
  chip,
  selected,
  onSelect,
}: {
  chip: ChipDef;
  selected: boolean;
  onSelect: (action: BrowseAction, chipId: string) => void;
}) {
  const { theme } = useTheme();
  const [hovered, setHovered] = useState(false);
  const onPress = useCallback(() => {
    haptic();
    onSelect(chip.action, chip.id);
  }, [onSelect, chip.action, chip.id]);

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel={`Browse ${chip.label.toLowerCase()}`}
      accessibilityState={{ selected }}
      style={({ pressed }) => {
        const isActive = selected;
        return {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          height: 32,
          paddingHorizontal: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: isActive ? theme.ink : theme.border,
          backgroundColor: isActive
            ? theme.ink
            : pressed || hovered
              ? theme.surface
              : theme.panel,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        };
      }}
    >
      <Feather
        name={chip.icon}
        size={13}
        color={selected ? theme.background : theme.ink}
      />
      <Text
        style={{
          fontSize: 12.5,
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

// ── Topic tile ──────────────────────────────────────────────────────────────
const TopicTile = memo(function TopicTile({
  topic,
  cover,
  onSelect,
}: {
  topic: TopicDef;
  cover?: string;
  onSelect: (action: TopicAction) => void;
}) {
  const onPress = useCallback(() => onSelect(topic.action), [onSelect, topic.action]);
  const uri = cover ? getOptimizedImageUrl(cover, { width: 120 }) : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Browse ${topic.label}`}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        padding: 9,
        // Explicit height rather than deriving it from the 34px thumb — keeps
        // every tile on one rhythm whether or not a cover has loaded.
        height: 54,
        borderRadius: radii.lg,
        borderWidth: 1,
        borderColor: colors.hair,
        backgroundColor: pressed ? colors.panel : colors.white,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      {/* The taxonomy icon is a layer, not a branch: it sits under the cover
          so a slow, missing or broken photo degrades to the icon instead of
          an empty purple circle. */}
      <View
        style={{
          width: 34,
          height: 34,
          // Circular, per the reference — the tile's only round element,
          // which is what makes the cover read as a topic avatar.
          borderRadius: 17,
          overflow: 'hidden',
          backgroundColor: colors.purpleSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name={topic.icon} size={15} color={colors.purple} />
        {uri ? (
          <Image
            source={{ uri }}
            // borderRadius is repeated on the image, not just the parent:
            // Android does not reliably clip an absolutely-positioned child to
            // a rounded parent's `overflow: hidden`, which left the cover as a
            // square patch over the circle on native while web looked right.
            style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: 17 }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={IMAGE_TRANSITION}
          />
        ) : null}
      </View>
      <Text
        style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontFamily: type.family.sansBold, color: colors.ink }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {topic.label}
      </Text>
    </Pressable>
  );
});
