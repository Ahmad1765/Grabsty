import { View } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';


import { useTheme } from '@/context/ThemeContext';
export type Credential = {
  key: string;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  /** Right-aligned value. Omit for a label-only row. */
  value?: string;
};

/**
 * Icon-led rows inside an <InfoCard>. Every row is a fact already in the
 * database — nothing here is placeholder copy, so a sparse new account simply
 * renders fewer rows rather than empty ones.
 */
export function CredentialList({ rows }: { rows: Credential[] }) {
  const { theme: colors } = useTheme();
  if (rows.length === 0) return null;

  return (
    <View>
      {rows.map((row, i) => (
        <View key={row.key}>
          {i > 0 ? (
            <View style={{ height: 1, backgroundColor: colors.hairline, marginVertical: 10 }} />
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {row.key === 'verified' || row.icon === 'shield' ? (
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: colors.purpleSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ShieldCheckIcon size={14} />
              </View>
            ) : (
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: colors.purpleSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name={row.icon} size={12} color={colors.purple} />
              </View>
            )}
            <Text

              style={{ flex: 1, fontSize: 13.5, color: colors.ink, fontWeight: '600' }}
              numberOfLines={2}
            >
              {row.label}
            </Text>
            {row.value ? (
              <Text style={{ fontSize: 13.5, color: colors.mute, fontWeight: '700' }}>
                {row.value}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}
