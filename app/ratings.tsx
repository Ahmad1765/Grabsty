import { useCallback, useState } from 'react';
import { View, Pressable, ScrollView, RefreshControl } from 'react-native';
import { Text } from '@/lib/rnText';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/context/ThemeContext';
import { radii, tabularNumberStyle } from '@/lib/theme';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { safeBack } from '@/lib/nav';

export default function RatingsScreen() {
  const { theme: colors } = useTheme();
  const { theme } = useTheme();
  const { profile, refreshProfile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  // Rating + sales come from the profile row; pull-to-refresh re-pulls it so a
  // freshly completed sale is reflected without leaving the screen.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshProfile();
    } finally {
      setRefreshing(false);
    }
  }, [refreshProfile]);

  const rating = Number(profile?.rating ?? 0);
  const sales = profile?.total_sales ?? 0;
  const showStars = Math.max(0, Math.min(5, Math.round(rating)));

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Top bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 14,
          paddingTop: 6,
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderBottomColor: theme.hairline,
        }}
      >
        <Pressable
          onPress={() => safeBack()}
          hitSlop={HIT_SLOP_8}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Feather name="chevron-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>Ratings</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.purple} />
        }
      >
        {/* Score card */}
        <View
          style={{
            marginTop: 18,
            backgroundColor: colors.purple,
            borderRadius: radii['2xl'],
            padding: 22,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '800',
              color: 'rgba(255,255,255,0.78)',
              letterSpacing: 1.2,
            }}
          >
            OVERALL RATING
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 8 }}>
            <Text
              style={[
                {
                  fontSize: 64,
                  fontWeight: '900',
                  color: 'white',
                  letterSpacing: -3,
                  lineHeight: 66,
                },
                tabularNumberStyle,
              ]}
            >
              {rating.toFixed(1)}
            </Text>
            <Text style={{ fontSize: 18, fontWeight: '700', color: 'rgba(255,255,255,0.65)', marginLeft: 6 }}>
              / 5
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 4, marginTop: 12 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Feather
                key={i}
                name="star"
                size={18}
                color={i < showStars ? 'white' : 'rgba(255,255,255,0.3)'}
              />
            ))}
          </View>
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', marginTop: 14 }}>
            From {sales} completed {sales === 1 ? 'sale' : 'sales'}
          </Text>
        </View>

        {/* Achievements */}
        <View style={{ marginTop: 18 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: theme.mute, letterSpacing: 0.6, marginBottom: 10 }}>
            ACHIEVEMENTS
          </Text>
          <View
            style={{
              backgroundColor: theme.panel,
              borderRadius: radii.xl,
              borderWidth: 1,
              borderColor: theme.border,
              overflow: 'hidden',
            }}
          >
            {[
              { icon: 'shield' as const, label: 'Verified by buyers', hint: 'Reach 4.5 rating', done: rating >= 4.5 },
              { icon: 'zap' as const, label: 'Featured seller', hint: 'Complete 25 sales', done: sales >= 25 },
              {
                icon: 'star' as const,
                label: 'Top-rated shop',
                hint: '4.8 rating + 50 sales',
                done: rating >= 4.8 && sales >= 50,
              },
            ].map((row, i, arr) => (
              <View key={row.label}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 14,
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: row.done ? theme.purpleSoft : theme.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                    }}
                  >
                    <Feather
                      name={row.done ? 'check' : row.icon}
                      size={16}
                      color={row.done ? theme.purple : theme.muteSoft}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: row.done ? theme.text : theme.mute }}>
                      {row.label}
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.mute, marginTop: 2 }}>{row.hint}</Text>
                  </View>
                  {row.done && (
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 999,
                        backgroundColor: colors.purple,
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '800', color: 'white', letterSpacing: 0.4 }}>
                        UNLOCKED
                      </Text>
                    </View>
                  )}
                </View>
                {i < arr.length - 1 && (
                  <View style={{ height: 1, backgroundColor: theme.hairline, marginLeft: 66 }} />
                )}
              </View>
            ))}
          </View>
        </View>

        {sales === 0 && (
          <View
            style={{
              marginTop: 14,
              padding: 14,
              borderRadius: radii.xl,
              backgroundColor: colors.purpleSoft,
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 10,
            }}
          >
            <Feather name="info" size={16} color={colors.purple} style={{ marginTop: 2 }} />
            <Text style={{ fontSize: 12.5, color: colors.purple, lineHeight: 18, flex: 1, fontWeight: '600' }}>
              No sales yet — ratings appear after your first completed transaction.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
