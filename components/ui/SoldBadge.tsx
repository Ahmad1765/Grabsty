import React, { memo } from 'react';
import { View, type ViewStyle } from 'react-native';
import { Text } from '@/lib/rnText';

export interface SoldBadgeProps {
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
}

const BRAND_PURPLE = '#6C47FF';

/**
 * Canonical Plick-style "Sold" badge styled in Grabsty's Signal Purple (#6C47FF) and Paper White (#FFFFFF) theme.
 * Compact rounded rectangle (borderRadius: 4) with bold Inter title-case typography.
 */
export const SoldBadge = memo(function SoldBadge({ size = 'md', style }: SoldBadgeProps) {
  const isLg = size === 'lg';
  const isSm = size === 'sm';

  return (
    <View
      style={[
        {
          backgroundColor: BRAND_PURPLE,
          paddingHorizontal: isLg ? 18 : isSm ? 10 : 13,
          paddingVertical: isLg ? 7 : isSm ? 4 : 5.5,
          borderRadius: 0,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.16,
          shadowRadius: 4,
          elevation: 3,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: '#FFFFFF',
          fontSize: isLg ? 16 : isSm ? 11 : 13,
          fontFamily: 'Inter_700Bold',
          fontWeight: '700',
          letterSpacing: -0.2,
          includeFontPadding: false,
          textAlign: 'center',
        }}
      >
        Sold
      </Text>
    </View>
  );
});
