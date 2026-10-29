import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, Alert, Platform, Animated, Easing, useWindowDimensions } from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import { SafeContainer } from '@/components/ui/SafeContainer';
import { isDesktopWidth } from '@/lib/responsive';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { signInWithGoogle } from '@/lib/oauth';
import { capture } from '@/lib/analytics';
import { ToastProvider, useToast } from '@/lib/toast';
import { BRAND } from '@/lib/brand';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFeedListingsQuery } from '@/lib/queries';
import { cardImageUrl, getOptimizedImageUrl } from '@/lib/images';
import { formatPrice } from '@/lib/currency';
import type { Listing } from '@/types';

import { useTheme } from '@/context/ThemeContext';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Mode = 'signin' | 'signup';
type Step = 'welcome' | 'form';

function tap(style: 'light' | 'medium' = 'light') {
  if (Platform.OS !== 'ios') return;
  Haptics.impactAsync(
    style === 'light'
      ? Haptics.ImpactFeedbackStyle.Light
      : Haptics.ImpactFeedbackStyle.Medium,
  );
}

function PressableScale({
  onPress,
  disabled,
  style,
  children,
  testID,
}: {
  onPress: () => void;
  disabled?: boolean;
  style?: any;
  children: React.ReactNode;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        style,
        { transform: [{ scale: pressed ? 0.975 : 1 }], opacity: disabled ? 0.55 : 1 },
      ]}
    >
      {children}
    </Pressable>
  );
}

// The screen is presented as a modal, which on Android draws over the root ToastProvider,
// so its errors ("Wrong email or password", reset-link status) were invisible. A local
// provider renders them inside the modal.
export default function LoginRoute() {
  return (
    <ToastProvider>
      <LoginScreen />
    </ToastProvider>
  );
}

function LoginScreen() {
  const { theme: colors, isDark } = useTheme();
  const toast = useToast();
  const params = useLocalSearchParams<{ mode?: string; step?: string }>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isDesktop = isDesktopWidth(width);
  const [step, setStep] = useState<Step>(() =>
    params.step === 'form' || params.mode === 'signin' || params.mode === 'signup' ? 'form' : 'welcome'
  );
  const [mode, setMode] = useState<Mode>(() => (params.mode === 'signup' ? 'signup' : 'signin'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [pwFocused, setPwFocused] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const passwordRef = useRef<any>(null);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [forgotCooldown, setForgotCooldown] = useState(0);

  useEffect(() => {
    if (forgotCooldown <= 0) return;
    const timer = setInterval(() => {
      setForgotCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [forgotCooldown]);

  const [stepAnim] = useState(() => new Animated.Value(0));
  const [switchAnim] = useState(() => new Animated.Value(mode === 'signin' ? 0 : 1));

  useEffect(() => {
    Animated.timing(stepAnim, {
      toValue: step === 'welcome' ? 0 : 1,
      duration: 280,
      easing: Easing.bezier(0.23, 1, 0.32, 1),
      // MUST stay false: stepAnim is interpolated into `panelHeight` and applied
      // as a `height` (see below). The native driver only supports transform and
      // opacity, so driving a layout prop natively throws on iOS/Android — web
      // never hit it because useNativeDriver is a no-op there.
      useNativeDriver: false,
    }).start();
  }, [step, stepAnim]);

  useEffect(() => {
    Animated.timing(switchAnim, {
      toValue: mode === 'signin' ? 0 : 1,
      duration: 260,
      easing: Easing.bezier(0.23, 1, 0.32, 1),
      useNativeDriver: false,
    }).start();
  }, [mode, switchAnim]);

  // Short or narrow phones: smaller headline, and a height floor so the
  // panel's chip + headline + subtitle never clip.
  const compact = height < 760 || width < 375;
  // Welcome: the hero takes whatever the three buttons + log-in line leave.
  const welcomeHeight = Math.max(
    Math.min(height - insets.top - insets.bottom - 300, 600),
    compact ? 300 : 340,
  );
  // Same query key as Discover's browse grid, so this is usually a cache hit.
  const feedQ = useFeedListingsQuery({ tab: 'popular', limit: 60 });
  const pillListings = useMemo(
    () =>
      (feedQ.data ?? [])
        .filter((l) => !l.is_sold && cardImageUrl(l))
        .slice(0, PILL_SLOTS.length),
    [feedQ.data],
  );
  // Pills need ~190px under the headline; short heroes skip them entirely.
  // Room under the headline. Short heroes keep only the rows that fit; tall
  // ones spread the pile upward instead of leaving a dead band.
  const pillArea = Math.min(welcomeHeight - (compact ? 220 : 270), 250);
  const pillScale = Math.max(1, pillArea / 190);
  const fitSlots = PILL_SLOTS.filter((slot) => slot.bottom + 52 <= pillArea);
  const pills = pillListings.slice(0, fitSlots.length).map((l, i) => ({ l, slot: fitSlots[i] }));
  const showPills = step === 'welcome' && pills.length > 0;
  const formHeight = Math.max(Math.min(height * 0.28, 240), 180);
  const panelHeight = stepAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [welcomeHeight, formHeight],
  });

  const validate = (): { email?: string; password?: string } => {
    const next: { email?: string; password?: string } = {};
    if (!email) next.email = 'Email is required';
    else if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email';
    if (!password) next.password = 'Password is required';
    else if (password.length < 8) next.password = 'Password must be at least 8 characters';
    return next;
  };

  const handleSubmit = async () => {
    const next = validate();
    if (next.email || next.password) {
      tap('medium');
      setErrors(next);
      return;
    }
    setErrors({});
    tap('medium');
    setLoading(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        capture('signed_in', { method: 'password' });
        toast.show('Welcome back', { variant: 'success', icon: 'check' });
        if (router.canDismiss()) router.dismiss();
        else router.replace('/(tabs)');
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        capture('signed_up', { method: 'password', needs_email_confirm: !data.session });
        if (data.session) {
          toast.show('Account created', { variant: 'success', icon: 'check' });
          router.replace('/onboarding');
        } else {
          Alert.alert(
            'Check your email',
            'We sent a confirmation link. Verify it, then sign in.',
            [{ text: 'Got it', onPress: () => setMode('signin') }],
          );
        }
      }
    } catch (e: any) {
      const raw = e?.message ?? '';
      const friendly = /invalid login/i.test(raw)
        ? 'Wrong email or password'
        : /email not confirmed/i.test(raw)
          ? 'Confirm your email first, then sign in'
          : /already registered|already exists/i.test(raw)
            ? 'That email already has an account — try signing in'
            : raw || 'Something went wrong. Please try again.';
      // Inline, not just a toast: the toast lands over the Sign in button and is gone in 2s.
      setErrors({ password: friendly });
      toast.show(friendly, { variant: 'default', icon: 'alert-triangle' });
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    tap('light');
    if (forgotCooldown > 0) {
      toast.show(`Please wait ${forgotCooldown}s before requesting another reset link`, {
        variant: 'info',
        icon: 'mail',
      });
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      toast.show('Enter your email above first', { variant: 'info', icon: 'mail' });
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: Linking.createURL('auth/reset'),
      });
      if (error) throw error;
      setForgotCooldown(60);
      toast.show('Password reset link sent — check your inbox', {
        variant: 'success',
        icon: 'check',
      });
    } catch (e: any) {
      const msg = e?.message ?? '';
      if (/rate_limit|over_email_send_rate_limit|429|too many/i.test(msg)) {
        setForgotCooldown(120);
        toast.show('Too many reset attempts. Please wait a couple minutes before trying again.', {
          variant: 'default',
          icon: 'alert-triangle',
        });
      } else {
        toast.show(msg || 'Could not send reset email', {
          variant: 'default',
          icon: 'alert-triangle',
        });
      }
    }
  };

  const goGuest = () => {
    tap('light');
    if (router.canDismiss()) router.dismiss();
    else router.replace('/(tabs)');
  };

  const handleGoogle = async () => {
    if (oauthLoading) return;
    tap('light');
    setOauthLoading(true);
    const r = await signInWithGoogle();
    setOauthLoading(false);
    if (r.ok) {
      toast.show('Welcome', { variant: 'success', icon: 'check' });
      if (router.canDismiss()) router.dismiss();
      else router.replace('/(tabs)');
    } else if (!r.cancelled) {
      toast.show(r.error ?? 'Google sign-in failed', { variant: 'default', icon: 'alert-triangle' });
    }
  };

  const openForm = (m: Mode) => {
    tap('light');
    setMode(m);
    setStep('form');
  };

  const backToWelcome = () => {
    tap('light');
    setStep('welcome');
  };

  // [first line, last word]: the last word renders a tone quieter.
  const headline: [string, string] = step === 'welcome'
    ? ['Your story\nstarts', 'now.']
    : mode === 'signup'
      ? ['Make it', 'yours.']
      : ['Welcome', 'back.'];

  return (
    <SafeContainer
      mode="keyboard-avoiding"
      edges={['top', 'bottom']}
      backgroundColor={colors.paper}
      style={{ flex: 1 }}
      contentContainerStyle={{
        flexGrow: 1,
        paddingBottom: 24,
        // Desktop: the phone layout as a centred card-width column.
        ...(isDesktop && { width: '100%', maxWidth: 480, alignSelf: 'center', justifyContent: 'center' }),
      }}
      scrollViewProps={{ bounces: false }}
    >
          {/* Hero panel: controls ride inside it, listing pills tumble along the bottom */}
          <Animated.View
            style={{
              marginHorizontal: 16,
              marginTop: 8,
              height: panelHeight,
              // Hero carries white text/overlays, so it stays dark in both themes
              // (`primary` flips to white in dark mode).
              backgroundColor: isDark ? colors.panel : colors.primary,
              borderRadius: 32,
              padding: 24,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: compact ? 18 : 26,
              }}
            >
              {step === 'form' || router.canDismiss() ? (
                <Pressable
                  onPress={step === 'form' ? backToWelcome : () => router.dismiss()}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={step === 'form' ? 'Back' : 'Close'}
                  style={({ pressed }) => ({
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: 'rgba(255,255,255,0.14)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: [{ scale: pressed ? 0.94 : 1 }],
                  })}
                >
                  <Feather name={step === 'form' ? 'arrow-left' : 'x'} size={18} color={colors.white} />
                </Pressable>
              ) : (
                <View />
              )}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 12,
                  height: 30,
                  borderRadius: 999,
                  backgroundColor: 'rgba(255,255,255,0.14)',
                }}
              >
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: colors.white,
                    marginRight: 8,
                  }}
                />
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: colors.white,
                    letterSpacing: 1.4,
                    textTransform: 'uppercase',
                  }}
                >
                  {BRAND}
                </Text>
              </View>
            </View>

            <Text
              style={{
                fontSize: step === 'welcome' ? (compact ? 46 : 58) : compact ? 38 : 44,
                fontWeight: '900',
                color: colors.white,
                lineHeight: step === 'welcome' ? (compact ? 46 : 58) : compact ? 40 : 46,
                letterSpacing: -2,
              }}
            >
              {headline[0]}
              {'\n'}
              {/* Last word sits back a tone, like a second voice in the line. */}
              <Text style={{ color: 'rgba(255,255,255,0.42)' }}>{headline[1]}</Text>
            </Text>

            {showPills && (
              <Animated.View
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: pillArea,
                  opacity: stepAnim.interpolate({ inputRange: [0, 0.4], outputRange: [1, 0], extrapolate: 'clamp' }),
                }}
              >
                {pills.map(({ l, slot }, i) => (
                  <ListingPill key={l.id} listing={l} slot={slot} index={i} scale={pillScale} />
                ))}
              </Animated.View>
            )}
          </Animated.View>

          {/* Action area */}
          <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
            {step === 'welcome' ? (
              <View style={{ gap: 12 }}>
                <PressableScale onPress={goGuest} style={{}}>
                  <View
                    style={{
                      height: 56,
                      borderRadius: 16,
                      // Resting controls stay Paper White + hairline (UI_GUARDRAILS: no grey fills).
                      backgroundColor: colors.paper,
                      borderWidth: 1,
                      borderColor: colors.border,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 20,
                    }}
                  >
                    <Feather name="user" size={18} color={colors.ink} />
                    <Text
                      style={{
                        marginLeft: 10,
                        fontSize: 15.5,
                        fontWeight: '700',
                        color: colors.ink,
                        letterSpacing: 0.1,
                      }}
                    >
                      Continue as guest
                    </Text>
                  </View>
                </PressableScale>

                <PressableScale onPress={() => openForm('signup')} style={{}}>
                  <View
                    style={{
                      height: 56,
                      borderRadius: 16,
                      backgroundColor: colors.primary,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 20,
                    }}
                  >
                    <Feather name="mail" size={18} color={colors.background} />
                    <Text
                      style={{
                        marginLeft: 10,
                        fontSize: 15.5,
                        fontWeight: '800',
                        color: colors.background,
                        letterSpacing: 0.1,
                      }}
                    >
                      Sign up with email
                    </Text>
                  </View>
                </PressableScale>

                <PressableScale onPress={handleGoogle} disabled={oauthLoading} style={{}}>
                  <View
                    style={{
                      height: 56,
                      borderRadius: 16,
                      // Resting controls stay Paper White + hairline (UI_GUARDRAILS: no grey fills).
                      backgroundColor: colors.paper,
                      borderWidth: 1,
                      borderColor: colors.border,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 20,
                    }}
                  >
                    <Ionicons name="logo-google" size={18} color={colors.ink} />
                    <Text
                      style={{
                        marginLeft: 10,
                        fontSize: 15.5,
                        fontWeight: '700',
                        color: colors.ink,
                        letterSpacing: 0.1,
                      }}
                    >
                      {oauthLoading ? 'Connecting…' : 'Continue with Google'}
                    </Text>
                  </View>
                </PressableScale>

                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginTop: 14,
                  }}
                >
                  <Text style={{ fontSize: 14, color: colors.mute }}>
                    Already have an account?
                  </Text>
                  <Pressable
                    testID="welcome-login-button"
                    onPress={() => openForm('signin')}
                    hitSlop={10}
                    style={({ pressed }) => ({
                      marginLeft: 6,
                      opacity: pressed ? 0.6 : 1,
                    })}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '800',
                        color: colors.ink,
                        textDecorationLine: 'underline',
                      }}
                    >
                      Log in
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View>
                <ModeSwitch
                  mode={mode}
                  onChange={setMode}
                  switchAnim={switchAnim}
                />

                <View style={{ marginTop: 22 }}>
                  <Field label="Email" icon="mail" focused={emailFocused} error={errors.email}>
                    <TextInput
                      testID="email-input"
                      returnKeyType="next"
                      submitBehavior="submit"
                      onSubmitEditing={() => passwordRef.current?.focus()}
                      placeholder="you@example.com"
                      placeholderTextColor={colors.muteSoft}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      textContentType="emailAddress"
                      accessibilityLabel="Email address"
                      value={email}
                      onChangeText={(t) => {
                        setEmail(t);
                        if (errors.email) setErrors((e) => ({ ...e, email: undefined }));
                      }}
                      onFocus={() => setEmailFocused(true)}
                      onBlur={() => setEmailFocused(false)}
                      style={{
                        fontSize: 16,
                        color: colors.ink,
                        padding: 0,
                        // RN-Web only — cast to bypass strict RN types
                        outlineStyle: 'none',
                        outlineWidth: 0,
                      } as any}
                    />
                  </Field>

                  <Field label="Password" icon="lock" focused={pwFocused} error={errors.password}>
                    <View
                      style={{ flexDirection: 'row', alignItems: 'center' }}
                    >
                      <TextInput
                        testID="password-input"
                        ref={passwordRef}
                        returnKeyType="go"
                        onSubmitEditing={() => { if (!loading) handleSubmit(); }}
                        placeholder="At least 8 characters"
                        placeholderTextColor={colors.muteSoft}
                        secureTextEntry={!showPw}
                        autoCapitalize="none"
                        autoComplete={mode === 'signup' ? 'password-new' : 'password'}
                        textContentType={mode === 'signup' ? 'newPassword' : 'password'}
                        accessibilityLabel="Password"
                        value={password}
                        onChangeText={(t) => {
                          setPassword(t);
                          if (errors.password) setErrors((e) => ({ ...e, password: undefined }));
                        }}
                        onFocus={() => setPwFocused(true)}
                        onBlur={() => setPwFocused(false)}
                        style={{
                          flex: 1,
                          fontSize: 16,
                          color: colors.ink,
                          padding: 0,
                          // RN-Web only — cast to bypass strict RN types
                          outlineStyle: 'none',
                          outlineWidth: 0,
                        } as any}
                      />
                      <Pressable
                        onPress={() => setShowPw((v) => !v)}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={showPw ? 'Hide password' : 'Show password'}
                        style={{ marginLeft: 8 }}
                      >
                        <Feather
                          name={showPw ? 'eye-off' : 'eye'}
                          size={18}
                          color={colors.mute}
                        />
                      </Pressable>
                    </View>
                  </Field>

                  {mode === 'signin' && (
                    <Pressable
                      testID="forgot-password-button"
                      onPress={handleForgot}
                      disabled={forgotCooldown > 0}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Reset your password"
                      style={({ pressed }) => ({
                        alignSelf: 'flex-end',
                        paddingVertical: 4,
                        marginTop: -2,
                        opacity: forgotCooldown > 0 ? 0.45 : pressed ? 0.6 : 1,
                      })}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>
                        {forgotCooldown > 0 ? `Resend link (${forgotCooldown}s)` : 'Forgot password?'}
                      </Text>
                    </Pressable>
                  )}
                </View>

                <PressableScale
                  testID="login-button"
                  onPress={handleSubmit}
                  disabled={loading}
                  style={{}}
                >
                  <View
                    style={{
                      marginTop: 8,
                      height: 58,
                      borderRadius: 18,
                      backgroundColor: colors.primary,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: '800',
                        color: colors.background,
                        letterSpacing: 0.2,
                      }}
                    >
                      {loading
                        ? 'One moment…'
                        : mode === 'signup'
                          ? 'Create account'
                          : 'Sign in'}
                    </Text>
                    <View
                      style={{
                        position: 'absolute',
                        right: 12,
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        backgroundColor: 'rgba(255,255,255,0.18)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Feather name="arrow-right" size={18} color={colors.background} />
                    </View>
                  </View>
                </PressableScale>

                <Text
                  style={{
                    marginTop: 16,
                    textAlign: 'center',
                    fontSize: 12,
                    color: colors.mute,
                    lineHeight: 17,
                    paddingHorizontal: 16,
                  }}
                >
                  {mode === 'signup' ? 'By creating an account you agree to our ' : 'By continuing you agree to our '}
                  <Text
                    accessibilityRole="link"
                    onPress={() => router.push('/legal/terms' as any)}
                    style={{ textDecorationLine: 'underline', color: colors.ink }}
                  >
                    Terms
                  </Text>
                  {' and '}
                  <Text
                    accessibilityRole="link"
                    onPress={() => router.push('/legal/privacy' as any)}
                    style={{ textDecorationLine: 'underline', color: colors.ink }}
                  >
                    Privacy Policy
                  </Text>
                  .
                </Text>
              </View>
            )}
          </View>
    </SafeContainer>
  );
}

function ModeSwitch({
  mode,
  onChange,
  switchAnim,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
  switchAnim: Animated.Value;
}) {
  const { theme: colors } = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const PADDING = 4;
  const pillWidth = trackWidth > 0 ? (trackWidth - PADDING * 2) / 2 : 0;

  const translateX = switchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, pillWidth],
  });

  const signinColor = switchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.background, colors.mute],
  });
  const signupColor = switchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.mute, colors.background],
  });

  return (
    <View
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      style={{
        backgroundColor: colors.panel,
        borderRadius: 999,
        padding: PADDING,
        flexDirection: 'row',
        position: 'relative',
        height: 52,
      }}
    >
      {pillWidth > 0 && (
        <Animated.View
          style={{
            position: 'absolute',
            top: PADDING,
            left: PADDING,
            bottom: PADDING,
            width: pillWidth,
            backgroundColor: colors.ink,
            borderRadius: 999,
            transform: [{ translateX }],
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.12,
            shadowRadius: 10,
            elevation: 3,
            pointerEvents: 'none',
          }}
        />
      )}
      {(['signin', 'signup'] as Mode[]).map((m) => {
        const color = m === 'signin' ? signinColor : signupColor;
        return (
          <Pressable
            key={m}
            onPress={() => {
              tap('light');
              onChange(m);
            }}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              height: 44,
              zIndex: 1,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            })}
          >
            <Animated.Text
              style={{
                fontSize: 14,
                fontFamily: 'Inter_700Bold',
                fontWeight: '800',
                color,
                letterSpacing: 0.2,
              }}
            >
              {m === 'signin' ? 'Sign in' : 'Sign up'}
            </Animated.Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Field({
  label,
  icon,
  children,
  focused,
  error,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  children: React.ReactNode;
  focused: boolean;
  error?: string;
}) {
  const { theme: colors } = useTheme();
  const DANGER = '#E5484D';
  const borderColor = error ? DANGER : focused ? colors.primary : colors.hairline;
  return (
    <View style={{ marginBottom: 14 }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          color: error ? DANGER : focused ? colors.ink : colors.mute,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          marginBottom: 8,
          marginLeft: 4,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          height: 56,
          borderRadius: 18,
          backgroundColor: colors.paper,
          borderWidth: error || focused ? 2 : 1,
          borderColor,
        }}
      >
        <Feather
          name={icon}
          size={18}
          color={error ? DANGER : focused ? colors.primary : colors.mute}
        />
        <View style={{ flex: 1, marginLeft: 12 }}>{children}</View>
      </View>
      {error ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, marginLeft: 4 }}>
          <Feather name="alert-circle" size={12} color={DANGER} />
          <Text style={{ fontSize: 12.5, color: DANGER, fontWeight: '600' }}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ── Hero listing pills ──────────────────────────────────────────────────────
// Real live listings scattered along the hero's bottom edge, tilted and
// clipped by the panel so they read as a pile rather than a grid. Positions are
// ordered so any count from 1 to 6 still looks composed. One inverted pill
// breaks the run of white without adding a colour.
type PillSlot = { left: `${number}%`; bottom: number; rotate: string; inverted?: boolean };
const PILL_SLOTS: PillSlot[] = [
  { left: '-6%', bottom: 124, rotate: '-8deg' },
  { left: '52%', bottom: 70, rotate: '7deg' },
  { left: '-3%', bottom: 16, rotate: '5deg' },
  { left: '46%', bottom: 14, rotate: '-5deg', inverted: true },
  { left: '58%', bottom: 128, rotate: '-6deg' },
  { left: '-14%', bottom: 70, rotate: '-3deg' },
];

const PILL_INK = '#0F0F0F';

function ListingPill({
  listing,
  slot,
  index,
  scale,
}: {
  listing: Listing;
  slot: PillSlot;
  index: number;
  scale: number;
}) {
  const [enter] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 520,
      delay: 120 + index * 70,
      easing: Easing.bezier(0.23, 1, 0.32, 1),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [enter, index]);

  const thumb = getOptimizedImageUrl(cardImageUrl(listing), { width: 96 });
  const name = listing.brand || listing.title;
  const sub = [formatPrice(listing.price, { whole: true }), listing.size].filter(Boolean).join(' · ');
  const inverted = !!slot.inverted;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: slot.left,
        bottom: Math.round(slot.bottom * scale),
        opacity: enter,
        transform: [
          { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
          { rotate: slot.rotate },
        ],
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: 48,
          maxWidth: 190,
          paddingLeft: 5,
          paddingRight: 16,
          borderRadius: 24,
          backgroundColor: inverted ? 'rgba(255,255,255,0.14)' : '#FFFFFF',
          borderWidth: inverted ? 1 : 0,
          borderColor: 'rgba(255,255,255,0.22)',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: inverted ? 0 : 0.14,
          shadowRadius: 10,
          elevation: inverted ? 0 : 3,
        }}
      >
        <Image
          source={{ uri: thumb }}
          style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(15,15,15,0.08)' }}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
        <View style={{ marginLeft: 9, flexShrink: 1 }}>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: 'Inter_700Bold',
              fontSize: 13,
              letterSpacing: -0.2,
              color: inverted ? '#FFFFFF' : PILL_INK,
            }}
          >
            {name}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: 'Inter_500Medium',
              fontSize: 11,
              marginTop: 1,
              color: inverted ? 'rgba(255,255,255,0.65)' : 'rgba(15,15,15,0.55)',
            }}
          >
            {sub}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}
