// Discover search hub: the segmented pill row plus the three non-item panels
// (Aesthetics / Brands / Users) it switches between. Speaks the app's own
// editorial language — bold Inter titles, uppercase Inter eyebrows, the
// promo card's tonal purple disc, hairline dividers, purple accents — strict
// purple/white/black throughout. Data is derived upstream in discover.tsx;
// only the Users panel owns state (its follow mask), because that state is
// meaningless to the rest of the screen.

import { useEffect, useMemo, useState } from 'react';
import { View, Pressable, ScrollView, Animated, Platform } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { getOptimizedImageUrl, IMAGE_TRANSITION } from '@/lib/images';
import { fetchFollowingMask, toggleFollow } from '@/lib/follows';
import { useToast } from '@/lib/toast';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import { useTheme } from '@/context/ThemeContext';
import { colors, radii, type } from '@/lib/theme';
import { HIT_SLOP_8 } from '@/lib/responsive';
import type { TagIndexEntry } from '@/lib/searchIndex';
import type { User } from '@/types';

const PAD = 16;
const DISPLAY_BOLD = type.family.sansBold; // Inter_700Bold
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

// Tags are stored lowercase (e.g. "cottagecore"); the aesthetics grid shows
// them as proper names ("Cottagecore"), capitalising the first letter of each
// word so the index reads like a style directory rather than raw hashtags.
function titleCase(s: string): string {
  return s.replace(/(^|[\s-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

const eyebrowStyle = {
  fontSize: 11,
  fontFamily: type.family.sansBold,
  color: colors.mute,
  letterSpacing: 1.4,
  textTransform: 'uppercase' as const,
};

export type DiscoverTab = 'items' | 'aesthetics' | 'brands' | 'users';

const TABS: { id: DiscoverTab; label: string }[] = [
  { id: 'items', label: 'Items' },
  { id: 'aesthetics', label: 'Aesthetics' },
  { id: 'brands', label: 'Brands' },
  { id: 'users', label: 'Users' },
];

// Pills hidden from the row (2026-07-04): the Items chip is suppressed per
// product call. Discover deliberately lands on Aesthetics (see the useState in
// discover.tsx); the Items grid is reached by a ?q= / ?category= deep link or
// by tapping a brand, not by a chip. To restore the chip, remove 'items' here.
const HIDDEN_TABS = new Set<DiscoverTab>(['items']);
const VISIBLE_TABS = TABS.filter((t) => !HIDDEN_TABS.has(t.id));

// ── Segmented pills ─────────────────────────────────────────────────────────
// Same idiom as the home feed's AnimatedTabPill: white pill that fills with
// soft purple + purple border when active, spring scale on press.
export function DiscoverSegments({
  tab,
  onChange,
}: {
  tab: DiscoverTab;
  onChange: (tab: DiscoverTab) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: PAD, gap: 8 }}
      style={{ marginTop: 14, flexGrow: 0 }}
    >
      {VISIBLE_TABS.map(({ id, label }) => (
        <SegmentPill
          key={id}
          label={label}
          active={tab === id}
          onPress={() => onChange(id)}
        />
      ))}
    </ScrollView>
  );
}

function SegmentPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { theme, isDark } = useTheme();
  const [colorAnim] = useState(() => new Animated.Value(active ? 1 : 0));
  const [scaleAnim] = useState(() => new Animated.Value(1));

  useEffect(() => {
    // Color interpolation can't ride the native driver.
    const anim = Animated.timing(colorAnim, {
      toValue: active ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [active, colorAnim]);

  const backgroundColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [isDark ? theme.surface : theme.panel, isDark ? theme.panel : '#111111'],
  });
  const borderColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.border, isDark ? theme.border : '#111111'],
  });

  return (
    <Pressable
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      onPress={onPress}
      onPressIn={() =>
        Animated.spring(scaleAnim, { toValue: 0.93, useNativeDriver: USE_NATIVE_DRIVER, speed: 30, bounciness: 4 }).start()
      }
      onPressOut={() =>
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: USE_NATIVE_DRIVER, speed: 20, bounciness: 6 }).start()
      }
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`Search ${label.toLowerCase()}`}
    >
      {/* Two nested Animated.Views on purpose. The scale spring runs on the
          native driver while the colour timing cannot (colour is not a
          natively-animatable prop). Putting both on ONE view moves that view's
          props node to native on first press, after which the JS-driven colour
          animation throws "Attempting to run JS driven animation on animated
          node that has been moved to native". Splitting them gives each driver
          its own props node. */}
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Animated.View
          style={{
            height: 30,
            paddingHorizontal: 14,
            borderRadius: radii.pill,
            borderWidth: 1,
            backgroundColor,
            borderColor,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontFamily: type.family.sansBold,
              color: active ? '#FFFFFF' : theme.mute,
            }}
          >
            {label}
          </Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

// ── Hub section title ───────────────────────────────────────────────────────
// The bold heading the editorial rails use (Daily picks / Recently viewed),
// so the hub panels read as chapters of the same magazine.
export function HubTitle({ title, eyebrow }: { title: string; eyebrow?: string }) {
  return (
    <View style={{ paddingHorizontal: PAD, marginTop: 20, marginBottom: 12 }}>
      {eyebrow ? <Text style={[eyebrowStyle, { marginBottom: 4 }]}>{eyebrow}</Text> : null}
      <Text style={{ fontFamily: DISPLAY_BOLD, fontSize: 20, color: colors.ink, letterSpacing: -0.3 }}>
        {title}
      </Text>
    </View>
  );
}

// ── Aesthetics ──────────────────────────────────────────────────────────────
// Live hashtags, not a curated list — every tile here is a tag sellers
// actually put on a listing (lib/searchIndex.ts's get_tag_index), so the
// grid grows and shrinks with the catalog on its own. Quiet panel tiles,
// name + live count on the left, a preview thumb on the right — a browsable
// index to skim, not a trending rail.
const TAG_TILE_GAP = 10;

export function AestheticsPanel({
  tags,
  onOpen,
}: {
  tags: TagIndexEntry[];
  onOpen: (tag: string) => void;
}) {
  // Retain all tags including odd counts — the trailing spacer balances the final row.
  const evenTags = tags;
  // Group into pairs of two for a rock-solid, responsive 2-column grid.
  // Using explicit rows with flex: 1 eliminates subpixel rounding and Yoga flexWrap
  // bugs where calculated pixel widths overflow the row on devices with odd screen
  // widths or fractional DPRs (e.g. 393px iPhone 14/15/16 Pro, Pixel).
  const rows = useMemo(() => {
    const result: TagIndexEntry[][] = [];
    for (let i = 0; i < evenTags.length; i += 2) {
      result.push(evenTags.slice(i, i + 2));
    }
    return result;
  }, [evenTags]);

  return (
    <View style={{ paddingHorizontal: PAD, gap: TAG_TILE_GAP }}>
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={{ flexDirection: 'row', gap: TAG_TILE_GAP }}>
          {row.map((t) => (
            <TagTile key={t.tag} entry={t} onPress={() => onOpen(t.tag)} />
          ))}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

// Compact index row: proper-cased name + live count on the left, a small
// preview thumb on the right — the browsable list layout. Quiet light-grey
// panel so the grid reads as a clean style directory; name in ink, count in
// muted grey, thumb portrait on the right.
function TagTile({
  entry,
  onPress,
}: {
  entry: TagIndexEntry;
  onPress: () => void;
}) {
  const { tag, count } = entry;
  const label = titleCase(tag);
  const uri = entry.image ? getOptimizedImageUrl(entry.image, { width: 200 }) : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Explore ${label}, ${count.toLocaleString()} outfits`}
      style={({ pressed }) => ({ flex: 1, minWidth: 0, transform: [{ scale: pressed ? 0.97 : 1 }] })}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: radii.xl,
          overflow: 'hidden',
          padding: 10,
          gap: 8,
          // Explicit height (padding + the 56/0.72 image height below) rather
          // than letting the row derive it from children — same native Yoga
          // row-sizing issue as the width fix above, just on the other axis.
          height: 98,
          backgroundColor: colors.panel,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{ fontFamily: DISPLAY_BOLD, fontSize: 15, color: colors.ink, letterSpacing: -0.2 }}
            numberOfLines={1}
          >
            {label}
          </Text>
          <Text
            style={{ fontSize: 12.5, color: colors.mute, marginTop: 3 }}
            numberOfLines={1}
          >
            {count.toLocaleString()} outfits
          </Text>
        </View>
        <View
          style={{
            width: 56,
            // Explicit height (56 / 0.72) instead of aspectRatio — kept
            // numeric everywhere in this tile since it's the piece under
            // suspicion for the native sizing bug.
            height: 78,
            borderRadius: radii.lg,
            overflow: 'hidden',
            backgroundColor: colors.purpleSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {uri ? (
            <Image
              source={{ uri }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={IMAGE_TRANSITION}
            />
          ) : (
            <Feather name="hash" size={16} color={colors.purple} />
          )}
        </View>
      </View>
    </Pressable>
  );
}

// ── Brands ──────────────────────────────────────────────────────────────────
// Brand storytelling gets the full-bleed editorial card — the promo banner's
// tonal purple disc + bold name, reused so the hub reads as one magazine.
// The preview collage below is real catalog photos (up to 3 recent covers
// from that brand's live listings, from get_brand_index) — no fabricated
// copy, unlike a "Brand is known for..." blurb would be.
export interface BrandEntry {
  name: string;
  count: number;
  /** Up to 3 recent cover shots from that brand's live listings. */
  images: string[];
}

export function BrandsPanel({
  brands,
  onSelect,
}: {
  brands: BrandEntry[];
  onSelect: (brand: string) => void;
}) {
  return (
    <View style={{ paddingHorizontal: PAD, gap: 14 }}>
      {brands.map((b) => (
        <BrandCard key={b.name} brand={b} onPress={() => onSelect(b.name)} />
      ))}
    </View>
  );
}

function BrandCard({ brand, onPress }: { brand: BrandEntry; onPress: () => void }) {
  const { name, count, images } = brand;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Shop ${name}, ${count} ${count === 1 ? 'item' : 'items'}`}
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.985 : 1 }] })}
    >
      <View
        style={{
          borderRadius: radii['3xl'],
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.divider,
        }}
      >
        <View style={{ padding: 20 }}>
        {/* Tonal purple disc — the promo banner's depth cue, reused so the
            hub and the idle feed share one visual family. Not a gradient. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: -70,
            top: -80,
            width: 190,
            height: 190,
            borderRadius: 95,
            backgroundColor: colors.purple,
            opacity: 0.1,
          }}
        />

        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                fontFamily: DISPLAY_BOLD,
                fontSize: 25,
                color: colors.ink,
                letterSpacing: -0.3,
              }}
              numberOfLines={1}
            >
              {name}
            </Text>
            <Text
              style={{
                fontSize: 10.5,
                fontFamily: type.family.sansBold,
                color: colors.mute,
                letterSpacing: 1.3,
                textTransform: 'uppercase',
                marginTop: 4,
              }}
            >
              {count} {count === 1 ? 'item live' : 'items live'}
            </Text>
          </View>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: colors.purpleSoft,
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: 10,
            }}
          >
            <Feather name="arrow-up-right" size={15} color={colors.purple} />
          </View>
        </View>

        {/* Preview collage — always three tiles so cards keep one rhythm;
            unmatched slots stay as quiet placeholders (never an empty hole). */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
          {Array.from({ length: 3 }).map((_, i) => {
            const uri = images[i] ? getOptimizedImageUrl(images[i], { width: 240 }) : null;
            return (
              <View
                key={i}
                style={{
                  flex: 1,
                  aspectRatio: 0.72,
                  borderRadius: radii.lg,
                  overflow: 'hidden',
                  backgroundColor: colors.panel,
                }}
              >
                {uri ? (
                  <Image
                    source={{ uri }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={IMAGE_TRANSITION}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
        </View>
      </View>
    </Pressable>
  );
}

// ── Users ───────────────────────────────────────────────────────────────────
export type PersonRow = Pick<
  User,
  'id' | 'username' | 'full_name' | 'avatar_url' | 'followers_count' | 'is_verified'
>;

// People list with inline follow. Owns the viewer→targets follow mask: fetched
// once per result set, then mutated optimistically on toggle (the RPC result
// reconciles it, a failure reverts it).
export function UsersPanel({ users, viewerId }: { users: PersonRow[]; viewerId: string | null }) {
  const toast = useToast();
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());

  // Keyed on the id SET rather than the `users` array identity — the parent
  // rebuilds that array on every render, and refetching the follow mask each
  // time would be pointless traffic.
  //
  // Deriving `ids` back out of the key (rather than listing `users` in the dep
  // array and suppressing the lint rule) makes the dependency list honest, so no
  // eslint-disable is needed. That matters: React Compiler refuses to optimize
  // any component where a React ESLint rule was disabled, so the suppression
  // that used to sit here cost UsersPanel its memoization.
  const idsKey = users.map((u) => u.id).join(',');
  const ids = useMemo(() => (idsKey ? idsKey.split(',') : []), [idsKey]);

  useEffect(() => {
    let on = true;
    if (!viewerId || ids.length === 0) {
      setFollowing(new Set());
      return;
    }
    fetchFollowingMask(viewerId, ids).then((mask) => {
      if (on) setFollowing(mask);
    });
    return () => {
      on = false;
    };
  }, [viewerId, ids]);

  const toggle = async (id: string) => {
    if (!viewerId) {
      toast.show('Sign in to follow sellers', { variant: 'info', icon: 'log-in' });
      router.push('/auth/login');
      return;
    }
    if (pending.has(id)) return;
    const wasFollowing = following.has(id);
    // Optimistic flip; reconciled from the RPC below.
    setFollowing((prev) => {
      const next = new Set(prev);
      if (wasFollowing) next.delete(id);
      else next.add(id);
      return next;
    });
    setPending((prev) => new Set(prev).add(id));

    // No `finally` — babel-plugin-react-compiler@1.0.0 can't lower one and bails
    // out of the whole component over it (see lib/errors.ts). Equivalent here:
    // neither branch returns or re-throws, so control always reaches the
    // un-pending call below.
    let isFollowing = wasFollowing;
    let failed = false;
    try {
      const state = await toggleFollow(viewerId, id, wasFollowing);
      isFollowing = state.isFollowing;
    } catch {
      failed = true;
    }

    if (failed) {
      toast.show("Couldn't update follow", { variant: 'default', icon: 'alert-triangle' });
    }
    // On success this reconciles to the server's answer; on failure `isFollowing`
    // is still `wasFollowing`, which reverts the optimistic flip above.
    setFollowing((prev) => {
      const next = new Set(prev);
      if (isFollowing) next.add(id);
      else next.delete(id);
      return next;
    });
    setPending((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  return (
    <View style={{ paddingHorizontal: 8 }}>
      {users.map((u) => (
        <UserRow
          key={u.id}
          user={u}
          isSelf={u.id === viewerId}
          isFollowing={following.has(u.id)}
          onToggle={() => toggle(u.id)}
        />
      ))}
    </View>
  );
}

function UserRow({
  user,
  isSelf,
  isFollowing,
  onToggle,
}: {
  user: PersonRow;
  isSelf: boolean;
  isFollowing: boolean;
  onToggle: () => void;
}) {
  const avatar = user.avatar_url ? getOptimizedImageUrl(user.avatar_url, { width: 120 }) : null;
  const initial = (user.full_name || user.username || 'U').trim().charAt(0).toUpperCase();
  const followers = Number(user.followers_count ?? 0);
  return (
    <Pressable
      onPress={() => router.push(`/user/${user.id}` as any)}
      accessibilityRole="button"
      accessibilityLabel={`View @${user.username}'s profile`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 10,
        borderRadius: radii.md,
        backgroundColor: pressed ? colors.panel : 'transparent',
      })}
    >
      <View
        style={{
          width: 50,
          height: 50,
          borderRadius: 25,
          overflow: 'hidden',
          backgroundColor: colors.purpleSoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}
      >
        {avatar ? (
          <Image
            source={{ uri: getOptimizedImageUrl(avatar, { width: 100 }) }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={IMAGE_TRANSITION}
          />
        ) : (
          <Text style={{ fontFamily: DISPLAY_BOLD, fontSize: 18, color: colors.purple }}>{initial}</Text>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text
            style={{ fontSize: 14.5, fontFamily: type.family.sansBold, color: colors.ink }}
            numberOfLines={1}
          >
            {user.full_name || user.username}
          </Text>
          {user.is_verified && <ShieldCheckIcon size={14} />}
        </View>

        <Text style={{ fontSize: 12.5, color: colors.mute, marginTop: 1 }} numberOfLines={1}>
          @{user.username}
          {followers > 0 ? ` · ${followers} ${followers === 1 ? 'follower' : 'followers'}` : ''}
        </Text>
      </View>
      {!isSelf ? (
        <Pressable
          hitSlop={HIT_SLOP_8}
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={isFollowing ? `Unfollow @${user.username}` : `Follow @${user.username}`}
          style={({ pressed }) => ({
            paddingHorizontal: 18,
            paddingVertical: 8,
            borderRadius: radii.pill,
            backgroundColor: isFollowing ? colors.panel : colors.purple,
            transform: [{ scale: pressed ? 0.96 : 1 }],
          })}
        >
          <Text
            style={{
              fontSize: 13,
              fontFamily: type.family.sansBold,
              color: isFollowing ? colors.ink : colors.white,
            }}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}
