// First-run taste onboarding, shown right after sign-up (replaces dropping the
// user straight into a profile-edit form). Three light steps: frame the value,
// capture a few interests to tune the feed, and seed the Following feed with a
// handful of real sellers. Everything is skippable.
import { useCallback, useEffect, useState } from 'react';
import { View, Pressable, ScrollView, Platform } from 'react-native';
import { Text } from '@/lib/rnText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { fetchSuggestedFollows, toggleFollow } from '@/lib/follows';
import { getOptimizedImageUrl } from '@/lib/images';
import { CATEGORIES } from '@/lib/categories';
import { BRAND } from '@/lib/brand';
import type { User } from '@/types';

import { useTheme } from '@/context/ThemeContext';
type Suggestion = Pick<
  User,
  'id' | 'username' | 'full_name' | 'avatar_url' | 'followers_count' | 'is_verified'
>;

function tap() {
  if (Platform.OS === 'ios') Haptics.selectionAsync();
}

const BENEFITS: { icon: keyof typeof Feather.glyphMap; title: string; desc: string }[] = [
  { icon: 'tag', title: 'Buy & sell preloved', desc: 'Give great pieces a second life, for less.' },
  { icon: 'shield', title: 'Buyer protection', desc: 'Every eligible order is covered if something goes wrong.' },
  { icon: 'package', title: 'Bundle & save', desc: 'Combine items from one seller and get a better price.' },
];

export default function OnboardingScreen() {
  const { theme: colors } = useTheme();
  const { user, refreshProfile } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [interests, setInterests] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSuggestedFollows(user?.id ?? null, 8)
      .then(setSuggestions)
      .catch(() => {});
  }, [user?.id]);

  const finish = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (user?.id && interests.size > 0) {
        await supabase.from('profiles').update({ interests: Array.from(interests) }).eq('id', user.id);
        await refreshProfile();
      }
    } catch {
      // Non-blocking — onboarding should never trap the user.
    }
    router.replace('/(tabs)');
  }, [saving, user?.id, interests, refreshProfile]);

  const next = useCallback(() => {
    tap();
    if (step < 2) setStep((s) => s + 1);
    else finish();
  }, [step, finish]);

  const toggleInterest = useCallback((id: string) => {
    tap();
    setInterests((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(id)) nextSet.delete(id);
      else nextSet.add(id);
      return nextSet;
    });
  }, []);

  const handleFollow = useCallback(
    async (id: string) => {
      if (!user?.id) return;
      tap();
      const already = followed[id] === true;
      setFollowed((p) => ({ ...p, [id]: !already }));
      try {
        const r = await toggleFollow(user.id, id, already);
        setFollowed((p) => ({ ...p, [id]: r.isFollowing }));
      } catch {
        setFollowed((p) => ({ ...p, [id]: already }));
        toast.show('Could not follow right now', { variant: 'default', icon: 'alert-triangle' });
      }
    },
    [user?.id, followed, toast],
  );

  const followCount = Object.values(followed).filter(Boolean).length;
  const primaryLabel =
    step === 0 ? 'Get started' : step === 1 ? 'Continue' : followCount > 0 ? 'Done' : 'Start browsing';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }} edges={['top', 'bottom']}>
      {/* Progress + skip */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 4,
        }}
      >
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={{
                width: i === step ? 22 : 7,
                height: 7,
                borderRadius: 999,
                backgroundColor: i === step ? colors.primary : colors.border,
              }}
            />
          ))}
        </View>
        <Pressable onPress={finish} hitSlop={10} accessibilityRole="button" accessibilityLabel="Skip onboarding">
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.mute }}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {step === 0 && (
          <View>
            <Text style={{ fontSize: 34, fontWeight: '900', color: colors.ink, letterSpacing: -1, lineHeight: 38 }}>
              Welcome to{'\n'}{BRAND}.
            </Text>
            <Text style={{ fontSize: 16, color: colors.mute, lineHeight: 23, marginTop: 12, marginBottom: 28 }}>
              The friendliest way to buy and sell preloved fashion. Here&apos;s what you get.
            </Text>
            <View style={{ gap: 16 }}>
              {BENEFITS.map((b) => (
                <View key={b.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      backgroundColor: 'rgba(108,71,255,0.10)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name={b.icon} size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>{b.title}</Text>
                    <Text style={{ fontSize: 13.5, color: colors.mute, lineHeight: 19, marginTop: 2 }}>{b.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {step === 1 && (
          <View>
            <Text style={{ fontSize: 28, fontWeight: '900', color: colors.ink, letterSpacing: -0.6 }}>
              What are you into?
            </Text>
            <Text style={{ fontSize: 15, color: colors.mute, lineHeight: 22, marginTop: 10, marginBottom: 24 }}>
              Pick a few and we&apos;ll tune your feed. You can change this anytime.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {CATEGORIES.map((c) => {
                const active = interests.has(c.id);
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => toggleInterest(c.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      borderRadius: 999,
                      borderWidth: 1.5,
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? 'rgba(108,71,255,0.10)' : colors.paper,
                      transform: [{ scale: pressed ? 0.97 : 1 }],
                    })}
                  >
                    <Feather name={c.icon} size={15} color={active ? colors.primary : colors.ink} />
                    <Text style={{ fontSize: 14.5, fontWeight: '700', color: active ? colors.primary : colors.ink }}>
                      {c.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {step === 2 && (
          <View>
            <Text style={{ fontSize: 28, fontWeight: '900', color: colors.ink, letterSpacing: -0.6 }}>
              Follow a few sellers
            </Text>
            <Text style={{ fontSize: 15, color: colors.mute, lineHeight: 22, marginTop: 10, marginBottom: 20 }}>
              Following sellers fills your feed with their latest drops.
            </Text>
            {suggestions.length === 0 ? (
              <Text style={{ fontSize: 14, color: colors.muteSoft, paddingVertical: 16 }}>
                No suggestions yet — you can find sellers to follow in Discover.
              </Text>
            ) : (
              <View style={{ gap: 4 }}>
                {suggestions.map((s) => {
                  const isFollowing = followed[s.id] === true;
                  return (
                    <View
                      key={s.id}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}
                    >
                      <View
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 24,
                          overflow: 'hidden',
                          backgroundColor: colors.surface,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {s.avatar_url ? (
                          <Image
                            source={{ uri: getOptimizedImageUrl(s.avatar_url, { width: 120 }) }}
                            style={{ width: 48, height: 48 }}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                          />
                        ) : (
                          <Feather name="user" size={20} color={colors.muteSoft} />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }} numberOfLines={1}>
                          @{s.username}
                        </Text>
                        <Text style={{ fontSize: 12.5, color: colors.mute }} numberOfLines={1}>
                          {(s.followers_count ?? 0).toLocaleString()} followers
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => handleFollow(s.id)}
                        accessibilityRole="button"
                        accessibilityLabel={isFollowing ? `Unfollow ${s.username}` : `Follow ${s.username}`}
                        style={({ pressed }) => ({
                          paddingHorizontal: 18,
                          paddingVertical: 9,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: isFollowing ? colors.border : colors.primary,
                          backgroundColor: isFollowing ? colors.paper : colors.primary,
                          transform: [{ scale: pressed ? 0.97 : 1 }],
                        })}
                      >
                        <Text
                          style={{ fontSize: 13.5, fontWeight: '800', color: isFollowing ? colors.ink : colors.background }}
                        >
                          {isFollowing ? 'Following' : 'Follow'}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Primary action */}
      <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12 }}>
        <Pressable
          onPress={next}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
          style={({ pressed }) => ({
            height: 56,
            borderRadius: 18,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: saving ? 0.6 : pressed ? 0.92 : 1,
            transform: [{ scale: pressed ? 0.99 : 1 }],
          })}
        >
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.background, letterSpacing: 0.2 }}>
            {primaryLabel}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
