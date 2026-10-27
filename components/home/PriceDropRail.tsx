// ─────────────────────────────────────────────────────────────────────────────
// PRICE DROP RAIL (PRESENTATIONAL)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Conditional Intent Rails
// Displays price drops on previously liked listings as an inline horizontal rail.
// Only renders when the user is viewing the "For You" feed with no active filters.
// ─────────────────────────────────────────────────────────────────────────────

import { memo } from 'react';
import { View, ScrollView } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { PriceDropCard } from '@/components/PriceDropCard';
import type { PriceDropListing } from '@/lib/myFeed';

import { useTheme } from '@/context/ThemeContext';
const HORIZONTAL_PAD = 12;
const GRID_GAP = 8;

function RailHeader({ icon, title }: { icon: keyof typeof Feather.glyphMap; title: string }) {
  const { theme: colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        marginBottom: 10,
      }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: colors.purpleSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name={icon} size={12} color={colors.purple} />
      </View>
      <Text style={{ fontSize: 14, fontWeight: '800', color: colors.ink, letterSpacing: -0.2 }}>
        {title}
      </Text>
    </View>
  );
}

type PriceDropRailProps = {
  show: boolean;
  priceDrops: PriceDropListing[];
};

export const PriceDropRail = memo(function PriceDropRail({
  show,
  priceDrops,
}: PriceDropRailProps) {
  if (!show || priceDrops.length === 0) return null;

  return (
    <View style={{ marginBottom: 14 }}>
      <RailHeader icon="trending-down" title="Price drops on your likes" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: HORIZONTAL_PAD, gap: GRID_GAP }}
      >
        {priceDrops.map((drop) => (
          <PriceDropCard key={drop.id} listing={drop} width={130} />
        ))}
      </ScrollView>
    </View>
  );
});
