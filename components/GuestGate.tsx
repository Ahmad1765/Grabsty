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
import { View, Pressable, Modal, Platform } from 'react-native';
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
  const { theme: colors } = useTheme();
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
        <Pressable
          onPress={close}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
        >
          {/* Inner press swallows taps so tapping the sheet doesn't dismiss it. */}
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: colors.paper,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingHorizontal: 24,
              paddingTop: 12,
              paddingBottom: (insets.bottom || 16) + 12,
            }}
          >
            <View
              style={{
                alignSelf: 'center',
                width: 40,
                height: 5,
                borderRadius: 3,
                backgroundColor: colors.hairline,
                marginBottom: 22,
              }}
            />
            {content && (
              <>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: 'rgba(108,71,255,0.10)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 16,
                  }}
                >
                  <Feather name={content.icon ?? 'lock'} size={24} color={colors.primary} />
                </View>
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: '900',
                    color: colors.ink,
                    letterSpacing: -0.4,
                    marginBottom: 8,
                  }}
                >
                  {content.title}
                </Text>
                <Text style={{ fontSize: 15, color: colors.mute, lineHeight: 22, marginBottom: 22 }}>
                  {content.message}
                </Text>

                <Pressable
                  onPress={() => goAuth('signup')}
                  accessibilityRole="button"
                  accessibilityLabel={content.cta ?? 'Create free account'}
                  style={({ pressed }) => ({
                    height: 54,
                    borderRadius: 16,
                    backgroundColor: colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.9 : 1,
                    transform: [{ scale: pressed ? 0.99 : 1 }],
                  })}
                >
                  <Text style={{ color: colors.background, fontSize: 16, fontWeight: '800' }}>
                    {content.cta ?? 'Create free account'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => goAuth('signin')}
                  style={({ pressed }) => ({ paddingVertical: 14, alignItems: 'center', opacity: pressed ? 0.6 : 1 })}
                >
                  <Text style={{ fontSize: 14, color: colors.ink, fontWeight: '700' }}>
                    I already have an account
                  </Text>
                </Pressable>

                <Pressable
                  onPress={close}
                  style={({ pressed }) => ({ paddingVertical: 4, alignItems: 'center', opacity: pressed ? 0.6 : 1 })}
                >
                  <Text style={{ fontSize: 13, color: colors.mute, fontWeight: '600' }}>Not now</Text>
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
