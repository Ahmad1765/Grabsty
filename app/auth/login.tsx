// Login & Sign Up. Two steps on a plain page (no banner):
//   welcome - mark, "Sign in to continue", then Google / Apple / email
//   form    - Sign in | Sign up switch, email + password
import { useEffect, useRef, useState } from 'react';
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
import { signInWithGoogle, signInWithApple, type OAuthResult } from '@/lib/oauth';
import { renderGoogleWebButton } from '@/lib/googleOneTap';
import { capture } from '@/lib/analytics';
import { ToastProvider, useToast } from '@/lib/toast';
import { BRAND } from '@/lib/brand';

import { useTheme } from '@/context/ThemeContext';
import { UserPlusIcon } from '@/components/ui/UserPlusIcon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type as typography } from '@/lib/theme';
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
  const { theme: colors } = useTheme();
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
  const gsiHost = useRef<View>(null);
  const [gsiReady, setGsiReady] = useState(false);

  useEffect(() => {
    if (forgotCooldown <= 0) return;
    const timer = setInterval(() => {
      setForgotCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [forgotCooldown]);

  const [switchAnim] = useState(() => new Animated.Value(mode === 'signin' ? 0 : 1));

  useEffect(() => {
    Animated.timing(switchAnim, {
      toValue: mode === 'signin' ? 0 : 1,
      duration: 260,
      easing: Easing.bezier(0.23, 1, 0.32, 1),
      useNativeDriver: false,
    }).start();
  }, [mode, switchAnim]);

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
        toast.done('Welcome back');
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
          toast.done('Account created');
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
      toast.done('Password reset link sent — check your inbox', 'send');
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

  useEffect(() => {
    if (Platform.OS !== 'web' || step !== 'welcome' || !gsiHost.current) return;
    let live = true;
    renderGoogleWebButton(gsiHost.current as unknown as HTMLElement, (r) => {
      if (live) finishOAuth(r.ok ? r : { ok: false, error: r.error });
    })
      .then((ok) => live && setGsiReady(ok))
      .catch(() => live && setGsiReady(false));
    return () => {
      live = false;
      setGsiReady(false);
    };
  }, [step]);

  // Web: Google's own button sits invisibly over ours (see renderGoogleWebButton),
  // so a click opens Google's popup naming Grabsty. Ours only handles clicks
  // when that button couldn't load, falling back to the redirect flow.
  const handleGoogle = () => (gsiReady ? undefined : runOAuth(signInWithGoogle));
  const handleApple = () => runOAuth(signInWithApple);

  const runOAuth = async (signIn: () => Promise<OAuthResult>) => {
    if (oauthLoading) return;
    tap('light');
    setOauthLoading(true);
    finishOAuth(await signIn());
  };

  const finishOAuth = (r: OAuthResult) => {
    setOauthLoading(false);
    if (r.ok) {
      toast.done('Welcome');
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

  const outlineButton = {
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  } as const;
  const buttonLabel = { marginLeft: 10, fontSize: 15.5, fontFamily: typography.family.sansSemibold, color: colors.ink } as const;
  const legal = (
    <Text style={{ textAlign: 'center', fontSize: 12, color: colors.mute, lineHeight: 17, paddingHorizontal: 16 }}>
      {mode === 'signup' && step === 'form' ? 'By creating an account you agree to our ' : 'By continuing you agree to our '}
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
  );

  return (
    <SafeContainer
      mode="keyboard-avoiding"
      edges={['top', 'bottom']}
      backgroundColor={colors.paper}
      style={{ flex: 1 }}
      contentContainerStyle={{
        flexGrow: 1,
        paddingBottom: 24,
        minHeight: isDesktop ? undefined : height - insets.top - insets.bottom,
        // Desktop: the phone layout as a centred card-width column.
        ...(isDesktop && { width: '100%', maxWidth: 440, alignSelf: 'center', justifyContent: 'center' }),
      }}
      scrollViewProps={{ bounces: false }}
    >
          {/* Top bar: close on welcome (when there is something to go back to), back on the form */}
          <View style={{ height: 52, paddingHorizontal: 12, justifyContent: 'center' }}>
            {step === 'form' || router.canDismiss() ? (
              <Pressable
                onPress={step === 'form' ? backToWelcome : () => router.dismiss()}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={step === 'form' ? 'Back' : 'Close'}
                style={({ pressed }) => ({
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Feather name={step === 'form' ? 'arrow-left' : 'x'} size={22} color={colors.ink} />
              </Pressable>
            ) : null}
          </View>

          {step === 'welcome' ? (
            <View
              style={{
                flex: 1,
                minHeight: isDesktop ? 260 : 220,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 32,
              }}
            >
              <UserPlusIcon size={64} color={colors.purple} strokeWidth={1.5} />
              <Text
                accessibilityRole="header"
                style={{
                  fontSize: 26,
                  fontFamily: typography.family.sansSemibold,
                  color: colors.ink,
                  letterSpacing: -0.6,
                  textAlign: 'center',
                  marginTop: 24,
                }}
              >
                Sign in to continue
              </Text>
              <Text style={{ fontSize: 15, lineHeight: 22, color: colors.mute, textAlign: 'center', marginTop: 8, maxWidth: 300 }}>
                Choose how you&apos;d like to sign in or create your {BRAND} account.
              </Text>
            </View>
          ) : (
            <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
              <Text
                accessibilityRole="header"
                style={{ fontSize: 26, fontFamily: typography.family.sansSemibold, color: colors.ink, letterSpacing: -0.6 }}
              >
                {mode === 'signup' ? 'Create your account' : 'Welcome back'}
              </Text>
              <Text style={{ fontSize: 15, lineHeight: 22, color: colors.mute, marginTop: 6 }}>
                {mode === 'signup' ? `Join ${BRAND} with your email.` : `Sign in to your ${BRAND} account.`}
              </Text>
            </View>
          )}

          {/* Action area */}
          <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
            {step === 'welcome' ? (
              <View style={{ gap: 12 }}>
                <PressableScale onPress={handleGoogle} disabled={oauthLoading} style={{}}>
                  <View style={[outlineButton, { backgroundColor: colors.ink, borderColor: colors.ink }]}>
                    <Ionicons name="logo-google" size={18} color={colors.background} />
                    <Text style={[buttonLabel, { color: colors.background }]}>
                      {oauthLoading ? 'Connecting…' : 'Continue with Google'}
                    </Text>
                  </View>
                  {Platform.OS === 'web' ? (
                    // Google's real button, invisible but on top, catching the click.
                    <View
                      ref={gsiHost}
                      testID="google-web-button"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: 0.01,
                        // Google's iframe is 40px tall; stretch it over the 52px button.
                        transform: [{ scaleY: 1.3 }],
                      }}
                    />
                  ) : null}
                </PressableScale>

                {Platform.OS === 'ios' ? (
                  <PressableScale onPress={handleApple} disabled={oauthLoading} style={{}}>
                    <View style={outlineButton}>
                      <Ionicons name="logo-apple" size={19} color={colors.ink} />
                      <Text style={buttonLabel}>Continue with Apple</Text>
                    </View>
                  </PressableScale>
                ) : null}

                {/* Opens the form; the Sign in | Sign up switch is there. */}
                <PressableScale testID="welcome-login-button" onPress={() => openForm(mode)} style={{}}>
                  <View style={outlineButton}>
                    <Feather name="mail" size={18} color={colors.ink} />
                    <Text style={buttonLabel}>Continue with email</Text>
                  </View>
                </PressableScale>

                <View style={{ marginTop: 8 }}>{legal}</View>

                <Pressable
                  onPress={goGuest}
                  hitSlop={8}
                  accessibilityRole="button"
                  style={({ pressed }) => ({ alignSelf: 'center', paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}
                >
                  <Text style={{ fontSize: 14, fontFamily: typography.family.sansSemibold, color: colors.mute }}>Continue as guest</Text>
                </Pressable>
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
                  {/* The send animation says it worked; this says what to do next. */}
                  {mode === 'signin' && forgotCooldown > 0 && (
                    <Text testID="reset-link-sent" style={{ fontSize: 13, color: colors.mute, marginTop: 6 }}>
                      Reset link sent. Check your inbox.
                    </Text>
                  )}
                </View>

                <PressableScale
                  testID="login-button"
                  onPress={handleSubmit}
                  disabled={loading}
                  style={{}}
                >
                  <View style={[outlineButton, { marginTop: 8, backgroundColor: colors.ink, borderColor: colors.ink }]}>
                    <Text style={[buttonLabel, { marginLeft: 0, fontSize: 16, color: colors.background }]}>
                      {loading
                        ? 'One moment…'
                        : mode === 'signup'
                          ? 'Create account'
                          : 'Sign in'}
                    </Text>
                  </View>
                </PressableScale>

                <View style={{ marginTop: 16 }}>{legal}</View>
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
