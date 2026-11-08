import { View, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { router, usePathname } from 'expo-router';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { Text } from '@/lib/rnText';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/lib/auth';
import { useActivityDot } from '@/hooks/useActivityDot';
import { useActivityUnreadCount } from '@/lib/queries';
import { useSellSheet } from '@/components/sell/SellSheet';
import { useDiscoverSheet } from '@/components/discover/DiscoverSheet';
import { DesktopSearch } from './DesktopSearch';
import { GrabstyLogo } from '@/components/ui/GrabstyLogo';
import { CATEGORIES } from '@/lib/categories';
import { isDesktopWidth, DESKTOP_FEED_MAX } from '@/lib/responsive';

// Desktop web header, replacing the phone's bottom AnimatedTabBar from 1024px
// up: brand, a wide search field, account shortcuts and "Sell now" on one
// row, top-level categories on a second. Mounted once above the root <Stack>
// (app/_layout.tsx) so it stays on product, chat and every other page.
//
// The phone dock is untouched: this renders nothing below the breakpoint,
// and the Tabs layout hides the dock above it.

// Full-screen flows that own the whole window.
const HIDDEN_PREFIXES = ['/onboarding', '/auth', '/listed', '/payment'];

const SAVED_HREF = '/?tab=saved&chipLabel=Saved&chipIcon=bookmark';

type HoverState = { pressed: boolean; hovered?: boolean };

export function DesktopTopNav() {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  if (!isDesktopWidth(width) || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  return <TopNav pathname={pathname} />;
}

function TopNav({ pathname }: { pathname: string }) {
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const sell = useSellSheet();
  const discover = useDiscoverSheet();
  const iconButton = (s: HoverState) => ({
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: s.hovered ? theme.surface : 'transparent',
    opacity: s.pressed ? 0.8 : 1,
  });

  return (
    <View
      role="navigation"
      style={{
        backgroundColor: theme.background,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.border,
        zIndex: 40,
      }}
    >
      {/* Row 1: brand · search · shortcuts · Sell now */}
      <View style={[frame, { height: 64, flexDirection: 'row', alignItems: 'center', gap: 20, zIndex: 2 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Home"
          onPress={() => router.navigate('/' as any)}
        >
          <GrabstyLogo size={28} variant="full" />
        </Pressable>

        <DesktopSearch />

        {/* Shortcut names match the phone dock's tabs (Activity, Account) so
            the same accessible names work at every width. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            marginLeft: 'auto',
          }}
        >
          {user && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={() => router.navigate('/news' as any)}
              style={iconButton}
            >
              <Feather
                name="bell"
                size={20}
                color={pathname.startsWith('/news') ? theme.ink : theme.textMuted}
              />
              <NotificationsDot userId={user.id} ringColor={theme.background} />
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Activity"
            testID="topnav-activity"
            onPress={() => router.navigate('/chat' as any)}
            style={iconButton}
          >
            <Feather
              name="message-circle"
              size={20}
              color={pathname.startsWith('/chat') ? theme.ink : theme.textMuted}
            />
            <ActivityDot ringColor={theme.background} />
          </Pressable>
          {user && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Saved items"
              onPress={() => router.navigate(SAVED_HREF as any)}
              style={iconButton}
            >
              <Feather name="heart" size={20} color={theme.textMuted} />
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Account"
            testID="topnav-account"
            onPress={() => router.navigate('/profile' as any)}
            style={iconButton}
          >
            {profile?.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: theme.surface,
                }}
                contentFit="cover"
              />
            ) : (
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: theme.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather
                  name="user"
                  size={16}
                  color={pathname.startsWith('/profile') ? theme.ink : theme.textMuted}
                />
              </View>
            )}
          </Pressable>
        </View>

        {!user && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign up or log in"
            onPress={() => router.push('/auth/login' as any)}
            style={(s: HoverState) => ({
              height: 36,
              paddingHorizontal: 16,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: s.hovered ? theme.surface : theme.panel,
              justifyContent: 'center',
            })}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.ink }}>Sign up | Log in</Text>
          </Pressable>
        )}

        {/* Ink, not purple: the page under the header owns the one purple CTA. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sell"
          testID="topnav-sell"
          onPress={() => void sell.open()}
          style={(s: HoverState) => ({
            height: 36,
            paddingHorizontal: 18,
            borderRadius: 18,
            backgroundColor: theme.ink,
            justifyContent: 'center',
            opacity: s.pressed ? 0.85 : s.hovered ? 0.92 : 1,
          })}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: theme.background }}>Sell now</Text>
        </Pressable>
      </View>

      {/* Row 2: top-level categories, each opening the home search filtered to it */}
      <View
        style={[
          frame,
          {
            height: 44,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingLeft: 2,
          },
        ]}
      >
        {CATEGORIES.map((c) => (
          <CategoryLink
            key={c.id}
            label={c.label}
            onPress={() => router.navigate(`/?searchOpen=1&searchCategory=${c.id}` as any)}
          />
        ))}
        <CategoryLink label="All categories" a11yLabel="Browse all categories" onPress={() => discover.open()} />
      </View>
    </View>
  );
}

const frame = {
  width: '100%',
  maxWidth: DESKTOP_FEED_MAX,
  alignSelf: 'center',
  paddingHorizontal: 12,
} as const;

function CategoryLink({
  label,
  a11yLabel,
  onPress,
}: {
  label: string;
  a11yLabel?: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? label}
      onPress={onPress}
      style={(s: HoverState) => ({
        height: 44,
        paddingHorizontal: 10,
        justifyContent: 'center',
        borderBottomWidth: 2,
        borderBottomColor: s.hovered ? theme.ink : 'transparent',
      })}
    >
      {(s: HoverState) => (
        <Text
          style={{
            fontSize: 14,
            fontWeight: '500',
            color: s.hovered ? theme.ink : theme.textMuted,
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function Dot({ ringColor }: { ringColor: string }) {
  const { theme } = useTheme();
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: theme.purple,
        borderWidth: 2,
        borderColor: ringColor,
      }}
    />
  );
}

// Same rule as the phone dock's dot (hooks/useActivityDot). Each dot is its
// own component so its hook only re-renders the dot.
function ActivityDot({ ringColor }: { ringColor: string }) {
  return useActivityDot() ? <Dot ringColor={ringColor} /> : null;
}

function NotificationsDot({ userId, ringColor }: { userId: string; ringColor: string }) {
  return useActivityUnreadCount(userId) > 0 ? <Dot ringColor={ringColor} /> : null;
}
