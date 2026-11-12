// /track?code=GRB-XXXXXXXX — look an order up by tracking ID or order number.
// Public: shows status and timestamps only (track_order returns no personal
// details), so a buyer, a seller or the team can paste an ID and see where
// the parcel is.

import { useCallback, useEffect, useState } from 'react';
import { View, Pressable, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { type as typography, tabularNumberStyle } from '@/lib/theme';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { safeBack } from '@/lib/nav';
import { tap } from '@/lib/haptics';
import { getOptimizedImageUrl } from '@/lib/images';
import { KeyboardAvoider } from '@/components/ui/SafeContainer';
import { TRACK_STATE_LABEL, trackOrder, type TrackResult } from '@/lib/orderTracking';

type Found = Extract<TrackResult, { found: true }>;

function when(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function steps(r: Found): { label: string; at: string | null; done: boolean }[] {
  const delivered = r.state === 'delivered' || r.state === 'completed' || !!r.delivered_at;
  const picked = delivered || r.state === 'in_transit' || !!r.picked_up_at;
  const ready = picked || r.state === 'ready' || !!r.ready_at;
  return [
    { label: 'Order placed', at: r.placed_at, done: true },
    { label: 'Ready for pickup', at: r.ready_at, done: ready },
    { label: 'Picked up · in transit', at: r.picked_up_at, done: picked },
    { label: 'Delivered', at: r.delivered_at, done: delivered },
  ];
}

export default function TrackScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ code?: string }>();
  const initial = String(params.code ?? '').trim();
  const [code, setCode] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TrackResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(async (value: string) => {
    const v = value.trim();
    if (v.length < 8) {
      setResult(null);
      setError('Enter a tracking ID like GRB-1A2B3C4D5E6F or an order number.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await trackOrder(v);
      if (!res.found && res.throttled) {
        setResult(null);
        setError('Too many lookups. Wait a minute and try again.');
        return;
      }
      setResult(res);
    } catch {
      setResult(null);
      setError("Couldn't check that right now. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initial) lookup(initial);
  }, [initial, lookup]);

  const found = result?.found ? result : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <KeyboardAvoider style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 20, paddingBottom: 40, width: '100%', maxWidth: 520, alignSelf: 'center' }}
        >
          <Pressable
            onPress={() => {
              tap('light');
              safeBack();
            }}
            hitSlop={HIT_SLOP_8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => ({ width: 40, height: 40, justifyContent: 'center', marginLeft: -6, opacity: pressed ? 0.6 : 1 })}
          >
            <Feather name="chevron-left" size={26} color={theme.ink} />
          </Pressable>
          <Text style={{ fontSize: 26, fontFamily: typography.family.sansBold, color: theme.ink, letterSpacing: -0.5, marginTop: 4 }}>
            Track an order
          </Text>
          <Text style={{ fontSize: 14, color: theme.mute, marginTop: 6, lineHeight: 20 }}>
            Enter the tracking ID or order number from your order page.
          </Text>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
            <TextInput
              testID="track-input"
              value={code}
              onChangeText={(t) => {
                setCode(t);
                setError(null);
              }}
              onSubmitEditing={() => lookup(code)}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="search"
              placeholder="GRB-1A2B3C4D5E6F"
              placeholderTextColor={theme.muteSoft}
              accessibilityLabel="Tracking ID or order number"
              style={[
                {
                  flex: 1,
                  minWidth: 0,
                  height: 48,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: error ? theme.danger : theme.border,
                  backgroundColor: theme.panel,
                  paddingHorizontal: 14,
                  fontSize: 16,
                  color: theme.ink,
                  fontFamily: typography.family.sansSemibold,
                },
                tabularNumberStyle,
              ]}
            />
            <Pressable
              testID="track-submit"
              onPress={() => {
                tap('light');
                lookup(code);
              }}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Track"
              style={({ pressed }) => ({
                height: 48,
                paddingHorizontal: 20,
                borderRadius: 24,
                backgroundColor: theme.ink,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: loading ? 0.6 : pressed ? 0.85 : 1,
              })}
            >
              {loading ? (
                <ActivityIndicator color={theme.background} />
              ) : (
                <Text style={{ fontSize: 15, fontFamily: typography.family.sansBold, color: theme.background }}>Track</Text>
              )}
            </Pressable>
          </View>

          {error ? (
            <Text style={{ fontSize: 13, color: theme.danger, marginTop: 10, fontFamily: typography.family.sansSemibold }}>{error}</Text>
          ) : null}

          {result && !result.found ? (
            <View testID="track-not-found" style={{ alignItems: 'center', marginTop: 40, paddingHorizontal: 12 }}>
              <Feather name="search" size={28} color={theme.ink} />
              <Text style={{ fontSize: 17, fontFamily: typography.family.sansBold, color: theme.ink, marginTop: 12 }}>No order found</Text>
              <Text style={{ fontSize: 14, color: theme.mute, marginTop: 6, textAlign: 'center', lineHeight: 20 }}>
                Check the ID and try again. It looks like GRB- followed by 12 letters and numbers.
              </Text>
            </View>
          ) : null}

          {found ? (
            <View
              testID="track-result"
              style={{ marginTop: 22, borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.panel, padding: 16 }}
            >
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <View style={{ width: 56, height: 56, borderRadius: 8, overflow: 'hidden', backgroundColor: theme.surface }}>
                  {found.image ? (
                    <Image source={{ uri: getOptimizedImageUrl(found.image, { width: 160 }) }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  ) : null}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 15, fontFamily: typography.family.sansBold, color: theme.ink }}>
                    {found.title ?? 'Order'}
                  </Text>
                  <Text style={[{ fontSize: 13, color: theme.mute, marginTop: 3 }, tabularNumberStyle]}>
                    {found.tracking_id} · Order #{found.reference}
                  </Text>
                </View>
              </View>

              <Text testID="track-state" style={{ fontSize: 20, fontFamily: typography.family.sansBold, color: theme.ink, marginTop: 18, letterSpacing: -0.3 }}>
                {TRACK_STATE_LABEL[found.state]}
              </Text>
              <Text style={{ fontSize: 13, color: theme.mute, marginTop: 4, lineHeight: 19 }}>
                {found.state === 'cancelled'
                  ? 'This order was cancelled.'
                  : found.state === 'under_review'
                  ? 'An issue was reported. Our team is reviewing this order.'
                  : [found.city ? `Delivering to ${found.city}` : null, found.courier || 'Grabsty Express'].filter(Boolean).join(' · ')}
              </Text>
              {found.courier_tracking_number ? (
                <Text style={[{ fontSize: 13, color: theme.mute, marginTop: 2 }, tabularNumberStyle]}>
                  Courier tracking number: {found.courier_tracking_number}
                </Text>
              ) : null}

              <View style={{ marginTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, paddingTop: 14, gap: 14 }}>
                {steps(found).map((s) => (
                  <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        backgroundColor: s.done ? theme.ink : 'transparent',
                        borderWidth: s.done ? 0 : 1.5,
                        borderColor: theme.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {s.done ? <Feather name="check" size={11} color={theme.background} /> : null}
                    </View>
                    <Text style={{ flex: 1, fontSize: 14, fontFamily: s.done ? typography.family.sansSemibold : typography.family.sans, color: s.done ? theme.ink : theme.mute }}>
                      {s.label}
                    </Text>
                    <Text style={[{ fontSize: 12.5, color: theme.mute }, tabularNumberStyle]}>{s.done ? when(s.at) : ''}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {!result && !loading && !error ? (
            <Pressable
              onPress={() => router.push('/(tabs)/chat' as any)}
              accessibilityRole="link"
              style={({ pressed }) => ({ marginTop: 22, opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={{ fontSize: 13.5, color: theme.mute }}>
                Your own orders are in <Text style={{ color: theme.ink, fontFamily: typography.family.sansSemibold }}>Activity → Orders</Text>.
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoider>
    </SafeAreaView>
  );
}
