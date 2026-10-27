import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, ScrollView, Platform, ActivityIndicator, Alert, BackHandler } from 'react-native';
import { KeyboardAvoider } from '@/components/ui/SafeContainer';
import { Text, TextInput } from '@/lib/rnText';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import Feather from '@expo/vector-icons/Feather';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { safeBack } from '@/lib/nav';
import { supabase } from '@/lib/supabase';
import {
  uploadAvatar,
  type LocalImage,
} from '@/lib/upload';
import { useToast } from '@/lib/toast';

import { useTheme } from '@/context/ThemeContext';
const PURPLE = '#6C47FF';
const RED = '#EF4444';

const LIMITS = {
  username: 20,
  fullName: 50,
  bio: 200,
  location: 60,
} as const;

function tap(style: 'light' | 'medium' = 'light') {
  if (Platform.OS !== 'ios') return;
  Haptics.impactAsync(
    style === 'light'
      ? Haptics.ImpactFeedbackStyle.Light
      : Haptics.ImpactFeedbackStyle.Medium,
  );
}

function FieldShell({
  label,
  error,
  multiline,
  focused,
  children,
}: {
  label?: string;
  error?: string | null;
  multiline?: boolean;
  focused: boolean;
  children: React.ReactNode;
}) {
  const { theme: colors } = useTheme();
  const borderColor = error ? RED : focused ? PURPLE : colors.border;

  return (
    <View style={{ marginBottom: 14 }}>
      {label ? (
        <Text
          style={{
            fontSize: 12,
            fontWeight: '600',
            color: focused ? PURPLE : colors.mute,
            marginBottom: 6,
            marginLeft: 4,
            letterSpacing: 0.3,
          }}
        >
          {label}
        </Text>
      ) : null}
      <View
        style={{
          backgroundColor: 'transparent',
          borderRadius: 12,
          borderWidth: 1,
          borderColor,
          paddingHorizontal: 16,
          paddingVertical: multiline ? 14 : 0,
          minHeight: multiline ? 100 : 50,
          justifyContent: multiline ? 'flex-start' : 'center',
        }}
      >
        {children}
      </View>
      {error && (
        <Text style={{ fontSize: 12, color: RED, marginTop: 5, marginLeft: 4, fontWeight: '600' }}>
          {error}
        </Text>
      )}
    </View>
  );
}

type UsernameStatus = 'idle' | 'checking' | 'ok' | 'taken';

export default function ProfileEditScreen() {
  const { theme: colors } = useTheme();
  const { profile, user, refreshProfile, loading } = useAuth();
  const toast = useToast();
  const params = useLocalSearchParams<{ onboarding?: string }>();
  const isOnboarding = params.onboarding === '1';
  // The SafeAreaView below only guards the top edge, so the sticky Save bar has
  // to clear the home indicator / gesture bar itself. Matches the pattern in
  // app/conversation/new.tsx rather than hardcoding a per-platform guess.
  const insets = useSafeAreaInsets();
  const ctaBottomPad = Math.max(insets.bottom, 12) + 12;

  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);

  const [saving, setSaving] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [focused, setFocused] = useState<string | null>(null);

  const mounted = useRef(true);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fullNameRef = useRef<TextInput>(null);
  const bioRef = useRef<TextInput>(null);
  const locationRef = useRef<TextInput>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (checkTimer.current) clearTimeout(checkTimer.current);
    };
  }, []);

  // Seed the form ONCE per profile row, not on every `profile` object identity.
  const seededForId = useRef<string | null>(null);
  useEffect(() => {
    if (!profile || seededForId.current === profile.id) return;
    seededForId.current = profile.id;
    setUsername(profile.username ?? '');
    setFullName(profile.full_name ?? '');
    setBio(profile.bio ?? '');
    setLocation('Lahore');
    setAvatarUri(profile.avatar_url ?? null);
    setAvatarBase64(null);
    setAvatarRemoved(false);
    setUsernameError(null);
    setUsernameStatus('idle');
  }, [profile]);

  const initialSnapshot = useMemo(
    () => ({
      username: (profile?.username ?? '').trim().toLowerCase(),
      fullName: profile?.full_name ?? '',
      bio: profile?.bio ?? '',
      location: 'Lahore',
      avatarUrl: profile?.avatar_url ?? null,
    }),
    [profile],
  );

  const isLocalImage = (uri: string | null) =>
    !!uri &&
    (uri.startsWith('file:') ||
      uri.startsWith('content:') ||
      uri.startsWith('data:') ||
      uri.startsWith('blob:'));

  const hasNewLocalAvatar = isLocalImage(avatarUri);

  const isDirty =
    username.trim().toLowerCase() !== initialSnapshot.username ||
    fullName.trim() !== initialSnapshot.fullName ||
    bio.trim() !== initialSnapshot.bio ||
    avatarRemoved ||
    hasNewLocalAvatar;

  const validateUsername = useCallback((raw: string): string | null => {
    const u = raw.trim().toLowerCase();
    if (!u) return 'Username is required';
    if (u.length < 3) return 'At least 3 characters';
    if (u.length > LIMITS.username) return `At most ${LIMITS.username} characters`;
    if (!/^[a-z0-9_.]+$/.test(u)) return 'Lowercase letters, numbers, _ . only';
    if (/^[._]|[._]$/.test(u)) return 'Cannot start or end with _ or .';
    if (/[._]{2,}/.test(u)) return 'No consecutive _ or .';
    return null;
  }, []);

  // Debounced uniqueness check
  useEffect(() => {
    let active = true;
    if (checkTimer.current) clearTimeout(checkTimer.current);
    const candidate = username.trim().toLowerCase();
    const err = validateUsername(candidate);
    if (err) {
      setUsernameStatus('idle');
      return;
    }
    if (candidate === (profile?.username ?? '')) {
      setUsernameStatus('idle');
      setUsernameError(null);
      return;
    }
    if (!user) return;
    setUsernameStatus('checking');
    checkTimer.current = setTimeout(async () => {
      const requestCandidate = candidate;
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', requestCandidate)
        .neq('id', user.id)
        .maybeSingle();
      if (!mounted.current || !active || requestCandidate !== username.trim().toLowerCase() || !user || !profile) return;
      if (error) {
        setUsernameStatus('idle');
        return;
      }
      if (data) {
        setUsernameStatus('taken');
        setUsernameError('Username already taken');
      } else {
        setUsernameStatus('ok');
        setUsernameError(null);
      }
    }, 450);
    return () => {
      active = false;
    };
  }, [username, profile, user, validateUsername]);

  const ensurePermission = useCallback(async (): Promise<boolean> => {
    const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status === 'granted') return true;
    if (!canAskAgain) {
      Alert.alert(
        'Photo access needed',
        'Enable photo library access in Settings to choose a profile picture.',
      );
    } else {
      toast.show('Permission denied', { variant: 'default', icon: 'alert-triangle' });
    }
    return false;
  }, [toast]);

  const pickAvatar = useCallback(async () => {
    tap('light');
    const ok = await ensurePermission();
    if (!ok) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (!mounted.current) return;
      setAvatarUri(asset.uri);
      setAvatarBase64(asset.base64 ?? null);
      setAvatarRemoved(false);
    } catch {
      toast.show('Could not open photos', { variant: 'default', icon: 'alert-triangle' });
    }
  }, [ensurePermission, toast]);



  const removeAvatar = useCallback(() => {
    if (!avatarUri && !profile?.avatar_url) return;
    tap('light');
    Alert.alert('Remove photo?', 'Your profile will show your initial instead.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setAvatarUri(null);
          setAvatarBase64(null);
          setAvatarRemoved(true);
        },
      },
    ]);
  }, [avatarUri, profile?.avatar_url]);

  const confirmDiscard = useCallback(() => {
    Alert.alert('Discard changes?', 'Your unsaved changes will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => safeBack() },
    ]);
  }, []);

  // Hardware back guard
  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (isOnboarding) return true; // block back during onboarding
        if (saving) return true; // block back while saving
        if (!isDirty) return false; // allow normal back
        confirmDiscard();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [isDirty, isOnboarding, saving, confirmDiscard]),
  );

  const handleBack = useCallback(() => {
    if (isOnboarding) return;
    if (saving) return;
    if (isDirty) {
      confirmDiscard();
      return;
    }
    safeBack();
  }, [isDirty, isOnboarding, saving, confirmDiscard]);

  const handleSave = useCallback(async () => {
    if (!user || saving) return;
    const err = validateUsername(username);
    if (err) {
      tap('medium');
      setUsernameError(err);
      return;
    }
    if (usernameStatus === 'taken') {
      tap('medium');
      return;
    }
    if (!isOnboarding && !isDirty) {
      safeBack();
      return;
    }
    setUsernameError(null);
    setSaving(true);
    tap('medium');

    try {
      let avatar_url: string | null = profile?.avatar_url ?? null;
      if (avatarRemoved) {
        avatar_url = null;
      } else if (hasNewLocalAvatar) {
        const localImg: LocalImage = { uri: avatarUri!, base64: avatarBase64 };
        avatar_url = await uploadAvatar(localImg, user.id);
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          username: username.trim().toLowerCase(),
          full_name: fullName.trim() || null,
          bio: bio.trim() || null,
          location: 'Lahore',
          avatar_url,
        })
        .eq('id', user.id);

      if (!mounted.current) return;

      if (error) {
        if (error.code === '23505') {
          setUsernameError('Username already taken');
          setUsernameStatus('taken');
        } else {
          toast.show(error.message ?? 'Could not save', {
            variant: 'default',
            icon: 'alert-triangle',
          });
        }
        return;
      }

      await refreshProfile();
      if (!mounted.current) return;

      toast.show(isOnboarding ? "You're in 🌶️" : 'Profile updated', {
        variant: 'success',
        icon: 'check',
      });

      if (isOnboarding) router.replace('/(tabs)');
      else safeBack();
    } catch (e: any) {
      if (!mounted.current) return;
      toast.show(e?.message ?? 'Something went wrong', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, [
    user,
    saving,
    username,
    fullName,
    bio,
    location,
    avatarRemoved,
    hasNewLocalAvatar,
    avatarUri,
    avatarBase64,
    isOnboarding,
    isDirty,
    profile?.avatar_url,
    refreshProfile,
    toast,
    usernameStatus,
    validateUsername,
  ]);

  if (loading || !profile) {
    return (
      <SafeAreaView
        edges={['top']}
        style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}
      >
        <ActivityIndicator color={PURPLE} />
      </SafeAreaView>
    );
  }

  const displayName = fullName || username || profile.username || 'U';
  const initial = displayName.trim().charAt(0).toUpperCase() || 'U';
  const showRemove = !!avatarUri || (!!profile.avatar_url && !avatarRemoved);

  const canSave =
    !validateUsername(username) &&
    usernameStatus !== 'taken' &&
    usernameStatus !== 'checking';

  const ctaLabel = saving
    ? 'Saving…'
    : isOnboarding
      ? 'Get started'
      : 'Save';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoider
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: 14,
            backgroundColor: colors.background,
          }}
        >
          <Pressable
            onPress={handleBack}
            disabled={isOnboarding || saving}
            hitSlop={12}
            style={({ pressed }) => ({
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: pressed ? colors.surface : colors.panel,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.border,
              opacity: isOnboarding ? 0 : 1,
            })}
          >
            <Feather name="arrow-left" size={18} color={colors.ink} />
          </Pressable>

          <Text
            style={{
              fontSize: 13,
              fontWeight: '700',
              color: colors.ink,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
            }}
          >
            {isOnboarding ? 'Step 1 of 1' : 'Edit Profile'}
          </Text>

          <View style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}>
            {isDirty && !isOnboarding ? (
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: PURPLE,
                  borderWidth: 1.5,
                  borderColor: colors.ink,
                }}
              />
            ) : null}
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Avatar at the top */}
          <View style={{ alignItems: 'center', marginTop: 12, marginBottom: 24 }}>
            <Pressable
              onPress={pickAvatar}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel="Change profile picture"
            >
              <View
                style={{
                  width: 110,
                  height: 110,
                  borderRadius: 55,
                  backgroundColor: colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: colors.border,
                  overflow: 'hidden',
                }}
              >
                {avatarUri ? (
                  <Image
                    source={{ uri: avatarUri }}
                    style={{ width: 110, height: 110 }}
                    contentFit="cover"
                    transition={150}
                  />
                ) : (
                  <Text
                    style={{ fontSize: 46, fontWeight: '900', color: colors.ink, letterSpacing: -2 }}
                  >
                    {initial}
                  </Text>
                )}
              </View>
              <View
                style={{
                  position: 'absolute',
                  right: 0,
                  bottom: 0,
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: PURPLE,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 2.5,
                  borderColor: colors.background,
                }}
              >
                <Feather name="camera" size={14} color="#FFFFFF" />
              </View>
            </Pressable>
          </View>

          {/* Form Fields */}
          <FieldShell label="Username" error={usernameError} focused={focused === 'username'}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 15, color: colors.mute, marginRight: 2 }}>@</Text>
              <TextInput
                placeholder="Username"
                placeholderTextColor={colors.mute}
                value={username}
                onChangeText={(t) => {
                  const cleaned = t.replace(/\s+/g, '').toLowerCase();
                  setUsername(cleaned.slice(0, LIMITS.username));
                  if (usernameError) setUsernameError(null);
                }}
                onFocus={() => setFocused('username')}
                onBlur={() => {
                  setFocused(null);
                  const err = validateUsername(username);
                  if (err) setUsernameError(err);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => fullNameRef.current?.focus()}
                maxLength={LIMITS.username}
                style={{ flex: 1, fontSize: 15, color: colors.ink, padding: 0 }}
              />
              {usernameStatus === 'checking' && (
                <ActivityIndicator size="small" color={colors.mute} style={{ marginLeft: 8 }} />
              )}
              {usernameStatus === 'ok' && (
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: PURPLE,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: 8,
                  }}
                >
                  <Feather name="check" size={12} color="#FFFFFF" />
                </View>
              )}
              {usernameStatus === 'taken' && (
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: RED,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: 8,
                  }}
                >
                  <Feather name="x" size={12} color="white" />
                </View>
              )}
            </View>
          </FieldShell>

          <FieldShell label="Display Name" focused={focused === 'fullName'}>
            <TextInput
              ref={fullNameRef}
              placeholder="Full name"
              placeholderTextColor={colors.mute}
              value={fullName}
              onChangeText={(t) => setFullName(t.slice(0, LIMITS.fullName))}
              onFocus={() => setFocused('fullName')}
              onBlur={() => setFocused(null)}
              maxLength={LIMITS.fullName}
              returnKeyType="next"
              onSubmitEditing={() => bioRef.current?.focus()}
              style={{ fontSize: 15, color: colors.ink, padding: 0 }}
            />
          </FieldShell>

          <FieldShell label="Bio" multiline focused={focused === 'bio'}>
            <TextInput
              ref={bioRef}
              placeholder="Bio"
              placeholderTextColor={colors.mute}
              value={bio}
              onChangeText={(t) => setBio(t.slice(0, LIMITS.bio))}
              onFocus={() => setFocused('bio')}
              onBlur={() => setFocused(null)}
              multiline
              textAlignVertical="top"
              maxLength={LIMITS.bio}
              scrollEnabled={false}
              style={{ fontSize: 15, color: colors.ink, padding: 0, minHeight: 72 }}
            />
          </FieldShell>

          <FieldShell label="Location" focused={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Feather name="map-pin" size={15} color={colors.mute} style={{ marginRight: 8 }} />
              <TextInput
                value="Lahore"
                editable={false}
                style={{ flex: 1, fontSize: 15, color: colors.ink, padding: 0 }}
              />
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 6,
                  backgroundColor: colors.primarySoft,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.mute, letterSpacing: 0.5 }}>
                  FIXED
                </Text>
              </View>
            </View>
          </FieldShell>

          {/* Account context (read-only) */}
          {!isOnboarding && user?.email && (
            <View style={{ marginBottom: 14 }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: colors.mute,
                marginBottom: 6,
                marginLeft: 4,
                letterSpacing: 0.3,
              }}
            >
              Email
            </Text>
            <View
              style={{
                backgroundColor: 'transparent',
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: 16,
                paddingVertical: 14,
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 14,
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: colors.primarySoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 12,
                }}
              >
                <Feather name="mail" size={15} color={colors.ink} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontSize: 14, fontWeight: '500', color: colors.ink }}
                  numberOfLines={1}
                >
                  {user.email}
                </Text>
              </View>
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 6,
                  backgroundColor: colors.primarySoft,
                }}
              >
                <Text
                  style={{ fontSize: 11, fontWeight: '700', color: colors.mute, letterSpacing: 0.5 }}
                >
                  LOCKED
                </Text>
              </View>
            </View>
            </View>
          )}

          {/* Save Button (In-flow, non-sticky) */}
          <View style={{ marginTop: 10, marginBottom: 8 }}>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={({ pressed }) => ({
                height: 50,
                borderRadius: 12,
                backgroundColor: PURPLE,
                borderWidth: 1,
                borderColor: '#5538D6',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                opacity: saving ? 0.85 : 1,
                transform: [{ scale: pressed ? 0.985 : 1 }],
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.08,
                shadowRadius: 3,
                elevation: 2,
              })}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : isOnboarding ? (
                <Feather name="arrow-right" size={16} color="#FFFFFF" />
              ) : null}
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '700',
                  color: '#FFFFFF',
                  letterSpacing: 0.2,
                }}
              >
                {ctaLabel}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoider>
    </SafeAreaView>
  );
}
