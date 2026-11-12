// Contextual guest gate. Instead of bouncing a signed-out user straight to the
// login screen the moment they tap like/save/follow/buy, we show a value-framed
// bottom sheet that explains why an account helps, then routes to auth. Mounted
// once (in the root layout) and driven app-wide via useGuestGate().prompt().
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { View, Pressable, Modal, Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Text } from '@/lib/rnText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { toggleLike } from '@/lib/listings';
import { toggleSave } from '@/lib/saves';
import { toggleFollow } from '@/lib/follows';

import { useTheme } from '@/context/ThemeContext';
// The action to auto-complete once the guest finishes signing in. Executed
// server-side by the provider with the fresh user id — the originating screen
// (product / card) re-checks its own like/save/follow state on user change, so
// the UI reconciles on its own without touching a stale closure.
export type ResumeIntent =
  | { kind: 'like'; listingId: string }
  | { kind: 'save'; listingId: string }
  | { kind: 'follow'; sellerId: string };

export type GuestPrompt = {
  title: string;
  message: string;
  icon?: keyof typeof Feather.glyphMap;
  /** Primary button label. Defaults to "Create free account". */
  cta?: string;
  /** Optional action to finish automatically after the user signs in. */
  resume?: ResumeIntent;
};

type GuestGateApi = { prompt: (opts: GuestPrompt) => void };

const Ctx = createContext<GuestGateApi | undefined>(undefined);

export function GuestGateProvider({ children }: { children: ReactNode }) {
  const { theme: colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [content, setContent] = useState<GuestPrompt | null>(null);
  // The pending resume intent survives the trip to the auth screen.
  const resumeRef = useRef<ResumeIntent | null>(null);
  const prevUserId = useRef<string | null>(user?.id ?? null);

  const prompt = useCallback((opts: GuestPrompt) => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setContent(opts);
  }, []);

  const close = useCallback(() => {
    // Dismissing without signing in cancels any queued resume.
    resumeRef.current = null;
    setContent(null);
  }, []);

  const goAuth = useCallback((mode: 'signin' | 'signup') => {
    if (content?.resume) resumeRef.current = content.resume;
    setContent(null);
    router.push(`/auth/login?mode=${mode}` as any);
  }, [content]);

  // Fire the queued action the moment the user transitions signed-out → signed-in.
  useEffect(() => {
    const cur = user?.id ?? null;
    const prev = prevUserId.current;
    prevUserId.current = cur;
    if (prev || !cur) return;
    const intent = resumeRef.current;
    if (!intent) return;
    resumeRef.current = null;
    (async () => {
      try {
        if (intent.kind === 'like') {
          await toggleLike(intent.listingId, cur, false);
        } else if (intent.kind === 'save') {
          await toggleSave(intent.listingId, cur, false);
        } else if (intent.kind === 'follow') {
          await toggleFollow(cur, intent.sellerId, false);
        }
      } catch {
        // Silent — the user can retry the action manually now that they're in.
      }
    })();
  }, [user?.id]);

  // Stable value so consumers' useCallback deps don't churn every render.
  const api = useMemo(() => ({ prompt }), [prompt]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <Modal
        visible={!!content}
        transparent
        animationType="slide"
        onRequestClose={close}
        // Android edge-to-edge (mandatory from Expo SDK 54): both flags, or the
        // modal window stops at the navigation bar. The sheet then sits on top of
        // an opaque strip AND still pads itself by insets.bottom, so the bottom
        // gap is counted twice on Android and once on web.
        statusBarTranslucent
        navigationBarTranslucent
      >
        {/* Same shape as BuyerProtectionSheet: grab handle, close, centred mark,
            title, one line, one filled button and a text link. */}
        <Pressable onPress={close} style={{ flex: 1, justifyContent: 'flex-end' }}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={22} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
          )}

          {/* Inner press swallows taps so tapping the sheet doesn't dismiss it. */}
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: colors.panel,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingHorizontal: 24,
              paddingTop: 8,
              paddingBottom: (insets.bottom || 16) + 8,
              width: '100%',
              maxWidth: 560,
              alignSelf: 'center',
            }}
          >
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />

            <Pressable
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel="Not now"
              testID="guest-gate-close"
              hitSlop={8}
              style={{ position: 'absolute', top: 12, right: 12, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
            >
              <Feather name="x" size={24} color={colors.ink} />
            </Pressable>

            {content && (
              <>
                <View
                  style={{
                    alignSelf: 'center',
                    marginTop: 28,
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    backgroundColor: 'rgba(108,71,255,0.10)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name={content.icon ?? 'lock'} size={26} color={colors.ink} />
                </View>
                <Text
                  accessibilityRole="header"
                  style={{ fontSize: 22, fontFamily: 'Inter_600SemiBold', color: colors.ink, textAlign: 'center', marginTop: 16 }}
                >
                  {content.title}
                </Text>
                <Text
                  style={{
                    fontSize: 15,
                    fontFamily: 'Inter_400Regular',
                    color: colors.mute,
                    lineHeight: 21,
                    textAlign: 'center',
                    marginTop: 6,
                  }}
                >
                  {content.message}
                </Text>

                <Pressable
                  onPress={() => goAuth('signup')}
                  accessibilityRole="button"
                  accessibilityLabel={content.cta ?? 'Create free account'}
                  testID="guest-gate-signup"
                  style={({ pressed }) => ({
                    height: 48,
                    marginTop: 28,
                    borderRadius: 10,
                    backgroundColor: colors.purple,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.9 : 1,
                  })}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 16, fontFamily: 'Inter_600SemiBold' }}>
                    {content.cta ?? 'Create free account'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => goAuth('signin')}
                  accessibilityRole="link"
                  testID="guest-gate-signin"
                  style={({ pressed }) => ({
                    alignSelf: 'center',
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    marginTop: 8,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: colors.purple }}>
                    I already have an account
                  </Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </Ctx.Provider>
  );
}

export function useGuestGate(): GuestGateApi {
  const ctx = useContext(Ctx);
  // Soft fallback outside the provider: keep the old behaviour (route to auth).
  if (!ctx) return { prompt: () => router.push('/auth/login') };
  return ctx;
}
