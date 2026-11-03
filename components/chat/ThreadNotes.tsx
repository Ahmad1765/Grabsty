import React from 'react';
import { View } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { radii, type as typography } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { BRAND } from '@/lib/brand';
import { dayLabel } from './format';

export function DateDivider({ iso }: { iso: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ alignItems: 'center', marginTop: 20, marginBottom: 10 }}>
      <Text
        style={{
          fontFamily: typography.family.sansMedium,
          fontSize: 13.5,
          color: theme.ink,
          opacity: 0.85,
        }}
      >
        {dayLabel(iso)}
      </Text>
    </View>
  );
}

export function SafetyNote({ onPress }: { onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          backgroundColor: theme.purpleSoft,
          borderRadius: radii.md,
          borderWidth: 1,
          borderColor: theme.border,
          padding: 12,
          gap: 10,
        }}
      >
        <Feather name="info" size={16} color={theme.purple} style={{ marginTop: 1 }} />
        <Text
          style={{
            flex: 1,
            fontFamily: typography.family.sans,
            fontSize: 12.5,
            lineHeight: 17,
            color: theme.ink,
          }}
        >
          Sharing personal details or following links is dangerous. You aren&apos;t protected if you leave {BRAND}.{' '}
          <Text
            onPress={onPress}
            accessibilityRole="link"
            accessibilityLabel="How you're covered"
            style={{
              fontFamily: typography.family.sansSemibold,
              color: theme.purple,
              textDecorationLine: 'underline',
            }}
          >
            See safety tips
          </Text>
        </Text>
      </View>
    </View>
  );
}
