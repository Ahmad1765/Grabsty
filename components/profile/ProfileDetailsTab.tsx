// ─────────────────────────────────────────────────────────────────────────────
// PROFILE DETAILS TAB (PRESENTATIONAL)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Seller Reputation, Progression & Quick Actions
// Displays the seller level progress bar, achievement badges, verified credentials,
// and quick settings action rows.
// ─────────────────────────────────────────────────────────────────────────────

import { memo } from 'react';
import { View } from 'react-native';
import { Text } from '@/lib/rnText';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { radii } from '@/lib/theme';
import { Card, ListRow } from '@/components/ui';
import { InfoCard } from './InfoCard';
import { CredentialList } from './CredentialList';
import { sellerCredentials } from './credentials';
import {
  LEVELS,
  computeLevel,
  computeBadges,
  type Badge,
} from '@/lib/levels';
import { CONTENT_MAX_WIDTH } from '@/lib/responsive';
import type { User as Profile, Listing } from '@/types';

import { useTheme } from '@/context/ThemeContext';
type ShopItem = {
  icon: any;
  title: string;
  subtitle: string;
  badge?: string;
  action: 'shop' | 'ratings' | 'bundle' | 'vacation' | 'share';
};

type ProfileDetailsTabProps = {
  profile: Profile;
  selling: Listing[];
  shopLikes: number;
  onShare: () => void;
};

export const ProfileDetailsTab = memo(function ProfileDetailsTab({
  profile,
  selling,
  shopLikes,
  onShare,
}: ProfileDetailsTabProps) {
  const { theme: colors } = useTheme();
  const sellingCount = selling.length;
  const rating = Number(profile.rating ?? 0);
  const totalSales = Number(profile.total_sales ?? 0);

  const sellerStats = {
    totalSales,
    rating,
    listingsCount: sellingCount,
    totalLikes: shopLikes,
    followers: profile.followers_count ?? 0,
  };

  const levelProgress = computeLevel(sellerStats);
  const badges = computeBadges(sellerStats, profile, true);
  const earnedBadges = badges.filter((b) => b.earned);
  const credentials = sellerCredentials(
    profile,
    { listingsCount: sellingCount, totalLikes: shopLikes },
    { viewer: 'owner' },
  );

  const bundlePct = profile.bundle_discount_pct ?? 0;
  const vacationOn = !!profile.vacation_mode;

  const items: ShopItem[] = [
    {
      icon: 'shopping-bag',
      title: 'Purchases & sales',
      subtitle: 'Your orders, invoices & payouts',
      action: 'shop',
    },
    {
      icon: 'star',
      title: 'Ratings & reviews',
      subtitle: 'How buyers have rated your sales',
      badge: rating > 0 ? rating.toFixed(1) : undefined,
      action: 'ratings',
    },
    {
      icon: 'percent',
      title: 'Bundle discount',
      subtitle: 'Reward buyers who shop multiple items',
      badge: bundlePct > 0 ? `${bundlePct}%` : 'Off',
      action: 'bundle',
    },
    {
      icon: 'pause-circle',
      title: 'Vacation mode',
      subtitle: 'Pause listings while away',
      badge: vacationOn ? 'On' : 'Off',
      action: 'vacation',
    },
    {
      icon: 'share-2',
      title: 'Share your profile',
      subtitle: 'Send a link to your shop',
      action: 'share',
    },
  ];

  return (
    <View style={{ marginTop: 12 }}>
      {/* About Me Card */}
      <InfoCard icon="user" title="About me">
        <Text
          style={{
            fontSize: 14,
            lineHeight: 20,
            color: profile.bio?.trim() ? colors.ink : colors.muteSoft,
          }}
        >
          {profile.bio?.trim()
            ? profile.bio
            : 'Add a short bio so buyers know who they’re dealing with.'}
        </Text>
      </InfoCard>

      {/* Seller Level Progress Card */}
      <InfoCard icon="award" title="Seller level">
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <Text
            style={{ fontSize: 13.5, fontWeight: '800', color: colors.ink, letterSpacing: -0.2 }}
          >
            {levelProgress.current.name}
          </Text>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '800',
              color: levelProgress.next ? colors.muteSoft : colors.purple,
              letterSpacing: 0.4,
            }}
          >
            {levelProgress.next
              ? `LEVEL ${levelProgress.current.id} / ${LEVELS.length}`
              : 'MAX LEVEL'}
          </Text>
        </View>
        <ProgressBar fraction={levelProgress.progress} />
        {levelProgress.nextRequirement ? (
          <Text style={{ fontSize: 12.5, color: colors.mute, fontWeight: '600', marginTop: 8 }}>
            {levelProgress.nextRequirement}
          </Text>
        ) : null}
      </InfoCard>

      {/* Achievements Strip */}
      {earnedBadges.length > 0 && (
        <InfoCard icon="star" title="Achievements">
          <AchievementsStrip badges={earnedBadges} />
        </InfoCard>
      )}

      {/* Seller Credentials List */}
      {credentials.length > 0 && (
        <InfoCard icon="shield" title="Seller credentials">
          <CredentialList rows={credentials} />
        </InfoCard>
      )}

      {/* Quick Action Cards */}
      <View style={{ paddingHorizontal: 16, alignItems: 'center' }}>
        <View style={{ width: '100%', maxWidth: CONTENT_MAX_WIDTH }}>
          <Card pad={0} variant="paper">
            {items.map((item, i) => (
              <View key={item.title}>
                <ListRow
                  icon={item.icon}
                  iconBg={colors.purpleSoft}
                  iconColor={colors.purple}
                  title={item.title}
                  subtitle={item.subtitle}
                  badge={item.badge}
                  badgeTone="mute"
                  onPress={() => {
                    if (item.action === 'shop') {
                      router.push({ pathname: '/(tabs)/chat', params: { tab: 'orders' } } as any);
                    } else if (item.action === 'ratings') {
                      router.push('/ratings' as any);
                    } else if (item.action === 'bundle') {
                      router.push('/settings?open=bundle' as any);
                    } else if (item.action === 'share') {
                      onShare();
                    } else {
                      router.push('/settings' as any);
                    }
                  }}
                />
                {i < items.length - 1 && (
                  <View
                    style={{
                      height: 1,
                      backgroundColor: colors.hairline,
                      marginLeft: 68,
                    }}
                  />
                )}
              </View>
            ))}
          </Card>
        </View>
      </View>
    </View>
  );
});

function ProgressBar({ fraction }: { fraction: number }) {
  const { theme: colors } = useTheme();
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <View
      style={{
        height: 8,
        borderRadius: 99,
        backgroundColor: colors.purpleSoft,
        overflow: 'hidden',
      }}
    >
      <View
        style={{ width: `${pct}%`, height: '100%', borderRadius: 99, backgroundColor: colors.purple }}
      />
    </View>
  );
}

function AchievementsStrip({ badges }: { badges: Badge[] }) {
  const { theme: colors } = useTheme();
  if (badges.length === 0) return null;
  const shown = badges.slice(0, 4);
  const extra = badges.length - shown.length;
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`${badges.length} ${badges.length === 1 ? 'achievement' : 'achievements'} earned`}
      style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 10 }}
    >
      {shown.map((b) => (
        <View
          key={b.key}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: radii.pill,
            backgroundColor: colors.purpleSoft,
          }}
        >
          <Feather name={b.icon as keyof typeof Feather.glyphMap} size={11} color={colors.purple} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.purple, letterSpacing: -0.1 }}>
            {b.label}
          </Text>
        </View>
      ))}
      {extra > 0 && (
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: radii.pill,
            backgroundColor: colors.panel,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.mute }}>+{extra}</Text>
        </View>
      )}
    </View>
  );
}
