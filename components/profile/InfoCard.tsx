import { View } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { radii, shadow } from '@/lib/theme';
import { CONTENT_MAX_WIDTH } from '@/lib/responsive';

import { useTheme } from '@/context/ThemeContext';
type Props = {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  children: React.ReactNode;
};

/**
 * Stacked info panel used by the Details tab: an icon-led heading over a body.
 *
 * Deliberately flat-with-hairline plus the lightest shadow in the system —
 * these sit on a white page, so the border does the separating and the shadow
 * only lifts the card off it.
 */
export function InfoCard({ icon, title, children }: Props) {
  const { theme: colors } = useTheme();
  return (
    // Clamped like <StatsBar>, so a Details panel doesn't run the full width of
    // a desktop viewport. A no-op below the cap.
    <View style={{ alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 }}>
      <View
        style={{
          width: '100%',
          maxWidth: CONTENT_MAX_WIDTH,
          padding: 16,
          backgroundColor: colors.surface,
          borderRadius: radii.xl,
          borderWidth: 1,
          borderColor: colors.border,
          ...shadow.sm,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Feather name={icon} size={15} color={colors.ink} />
          <Text
            style={{ fontSize: 14.5, fontWeight: '800', color: colors.ink, letterSpacing: -0.2 }}
          >
            {title}
          </Text>
        </View>
        <View style={{ marginTop: 12 }}>{children}</View>
      </View>
    </View>
  );
}
