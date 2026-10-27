import { useCallback, useState } from 'react';
import { View, Pressable, Platform, ScrollView } from 'react-native';
import { Text } from '@/lib/rnText';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { safeBack } from '@/lib/nav';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useOpenedNewsIds } from '@/lib/newsStorage';
import { useNewFromFollowedQuery } from '@/lib/queries';
import { radii, shadow, type as typography } from '@/lib/theme';
import { FollowingTab } from '@/components/news';

function haptic() {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

/**
 * Signed-out prompt view when the visitor does not have an account.
 * Directs them to create an account to view and follow creators.
 */
function SignedOutNewsState() {
  const { theme } = useTheme();

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingBottom: 40,
      }}
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: theme.surface,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 20,
        }}
      >
        <Feather name="bell" size={32} color={theme.purple} />
      </View>

      <Text
        style={{
          fontFamily: typography.family.sansBold,
          fontSize: 20,
          fontWeight: '700',
          color: theme.ink,
          textAlign: 'center',
          marginBottom: 8,
          letterSpacing: -0.3,
        }}
      >
        Create an account to see notifications
      </Text>

      <Text
        style={{
          fontFamily: typography.family.sans,
          fontSize: 14,
          color: theme.muteSoft,
          textAlign: 'center',
          lineHeight: 20,
          maxWidth: 320,
          marginBottom: 28,
        }}
      >
        Follow your favorite accounts and get notified when they drop new items, offer discounts, and update their collections.
      </Text>

      <Pressable
        onPress={() => {
          haptic();
          router.push('/auth/login' as any);
        }}
        accessibilityRole="button"
        accessibilityLabel="Create an account"
        style={({ pressed }) => ({
          backgroundColor: theme.purple,
          paddingHorizontal: 28,
          height: 48,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          maxWidth: 280,
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
          ...shadow.sm,
        })}
      >
        <Text
          style={{
            fontFamily: typography.family.sansBold,
            fontSize: 15,
            fontWeight: '700',
            color: '#FFFFFF',
          }}
        >
          Create an account
        </Text>
      </Pressable>

      <Pressable
        onPress={() => {
          haptic();
          router.push('/auth/login' as any);
        }}
        accessibilityRole="button"
        accessibilityLabel="Sign in"
        style={({ pressed }) => ({
          marginTop: 14,
          paddingVertical: 8,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text
          style={{
            fontFamily: typography.family.sansMedium,
            fontSize: 14,
            color: theme.purple,
          }}
        >
          Already have an account? Sign in
        </Text>
      </Pressable>
    </View>
  );
}

type NotificationFilter = 'all' | 'buyer' | 'important';

export default function NewsScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const toast = useToast();
  const [filter, setFilter] = useState<NotificationFilter>('all');

  const userId = user?.id ?? null;
  const { markAllOpened } = useOpenedNewsIds();

  // News notifications strictly from followed accounts only
  const followedQ = useNewFromFollowedQuery(userId);

  const handleMarkAllRead = useCallback(async () => {
    haptic();
    if (!user) {
      toast.show('Create an account or sign in to see notifications', { variant: 'info', icon: 'log-in' });
      router.push('/auth/login' as any);
      return;
    }
    const followedListings = followedQ.data ?? [];
    if (followedListings.length === 0) {
      toast.show('No notifications to mark as read', { variant: 'info', icon: 'check-circle' });
      return;
    }
    const idsToMark = followedListings.map((l) => `listing-${l.id}`);
    await markAllOpened(idsToMark);
    toast.show('All notifications marked as read', { variant: 'info', icon: 'check-circle' });
  }, [user, followedQ.data, markAllOpened, toast]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Top Header Bar matching Reference Image 3 */}
      <View
        style={{
          position: 'relative',
          height: 48,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          backgroundColor: theme.background,
        }}
      >
        {/* Dead-center "Notifications" Title */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 17,
              fontWeight: '700',
              color: theme.ink,
              letterSpacing: -0.3,
            }}
          >
            Notifications
          </Text>
        </View>

        {/* Left: Back Arrow */}
        <Pressable
          onPress={() => {
            haptic();
            safeBack();
          }}
          hitSlop={HIT_SLOP_8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            alignItems: 'flex-start',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Feather name="chevron-left" size={26} color={theme.ink} />
        </Pressable>

        {/* Right: Simple icon-only "Mark read" matching Reference Image 3 */}
        <Pressable
          onPress={handleMarkAllRead}
          hitSlop={HIT_SLOP_8}
          accessibilityRole="button"
          accessibilityLabel="Mark all as read"
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            alignItems: 'flex-end',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Ionicons name="checkmark-done-outline" size={22} color={theme.ink} />
        </Pressable>
      </View>

      {/* Filter Chips matching Reference Image 3: Always shown even if 0 notifications */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 10,
          backgroundColor: theme.background,
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            gap: 8,
            alignItems: 'center',
          }}
        >
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'buyer', label: 'Buyer' },
              { key: 'important', label: 'Important' },
            ] as const
          ).map((item) => {
            const active = filter === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => {
                  haptic();
                  setFilter(item.key);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Filter ${item.label}`}
                style={({ pressed }) => ({
                  height: 36,
                  paddingHorizontal: 18,
                  borderRadius: 10,
                  backgroundColor: active
                    ? isDark
                      ? '#FFFFFF'
                      : '#1D1D1D'
                    : isDark
                    ? theme.surface
                    : '#F3F3F3',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                })}
              >
                <Text
                  style={{
                    fontFamily: active
                      ? typography.family.sansBold
                      : typography.family.sansMedium,
                    fontSize: 14,
                    fontWeight: active ? '700' : '500',
                    color: active
                      ? isDark
                        ? '#111111'
                        : '#FFFFFF'
                      : theme.ink,
                    letterSpacing: -0.2,
                  }}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Main Content: Ask to create account if guest, otherwise show followed accounts news */}
      <View style={{ flex: 1 }}>
        {user ? (
          <FollowingTab
            bottomInset={Math.max(insets.bottom, 16) + 16}
            filter={filter}
          />
        ) : (
          <SignedOutNewsState />
        )}
      </View>
    </SafeAreaView>
  );
}
