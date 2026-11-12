// /courier/<order id> — the rider dashboard for one order, opened by scanning
// the seller's Pickup QR code (or from /courier). Riders only: the server
// answers 'signin' / 'forbidden' to everyone else, so buyers and sellers can't
// see the order here or enter the pickup code themselves.
//   Pickup:   the rider enters the 6-digit code the seller shows them;
//             courier_confirm_pickup locks the order In Transit and assigns it
//             to this rider. Wrong codes are counted; after 5 the code locks.
//   Delivery: the assigned rider sees the delivery address and confirms the
//             handover; courier_confirm_delivery marks the order Delivered.

import { useCallback, useEffect, useState } from 'react';
import { View, Pressable, ActivityIndicator, ScrollView, Linking } from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { type as typography, tabularNumberStyle } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { getOptimizedImageUrl } from '@/lib/images';
import { tap } from '@/lib/haptics';
import { confirm } from '@/lib/confirm';
import { KeyboardAvoider } from '@/components/ui/SafeContainer';
import { BRAND } from '@/lib/brand';
import { COURIER_MESSAGES, type CourierInfo, type CourierState } from '@/lib/orderTracking';

type State = CourierState | 'loading' | 'error';
type Info = Omit<CourierInfo, 'state'> & { state: State };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ERROR_MESSAGE = { icon: 'wifi-off', title: "Couldn't load the order", body: 'Check your connection and try again.' };

export default function CourierOrderScreen() {
  const { theme } = useTheme();
  const { user, loading: authLoading } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = String(id ?? '');
  const [info, setInfo] = useState<Info>({ state: 'loading' });
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!UUID.test(orderId)) {
      setInfo({ state: 'not_found' });
      return;
    }
    // Signed out: the rider functions aren't callable at all, so don't try.
    if (authLoading) return;
    if (!user?.id) {
      setInfo({ state: 'signin' });
      return;
    }
    setInfo((i) => ({ ...i, state: 'loading' }));
    const { data, error: rpcError } = await supabase.rpc('courier_pickup_info', { p_order_id: orderId });
    setInfo(rpcError || !data ? { state: 'error' } : (data as Info));
  }, [orderId, user?.id, authLoading]);

  // Also reloads when the account changes (a rider signing in on this device).
  useEffect(() => {
    load();
  }, [load]);

  const digits = code.replace(/[^0-9]/g, '').slice(0, 6);

  const submitPickup = async () => {
    if (digits.length !== 6 || submitting) return;
    tap('medium');
    setSubmitting(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('courier_confirm_pickup', {
      p_order_id: orderId,
      p_code: digits,
    });
    setSubmitting(false);
    if (rpcError || !data) {
      setError('Something went wrong. Try again.');
      return;
    }
    const r = data as { ok: boolean; state: CourierState; attempts_left?: number };
    if (r.state === 'wrong_code') {
      setCode('');
      setError(`Wrong code. ${r.attempts_left} ${r.attempts_left === 1 ? 'try' : 'tries'} left.`);
      setInfo((i) => ({ ...i, attempts_left: r.attempts_left }));
      return;
    }
    // Picked up: reload to get the delivery details for this rider.
    if (r.ok) await load();
    else setInfo((i) => ({ ...i, state: r.state }));
  };

  const submitDelivery = async () => {
    if (submitting) return;
    tap('medium');
    const ok = await confirm({
      title: 'Confirm delivery?',
      message: info.cod
        ? 'Confirm you handed the parcel to the buyer and collected the cash. This marks the order Delivered.'
        : 'Confirm you handed the parcel to the buyer. This marks the order Delivered.',
      confirmLabel: 'Delivered',
    });
    if (!ok) return;
    setSubmitting(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('courier_confirm_delivery', { p_order_id: orderId });
    setSubmitting(false);
    if (rpcError || !data) {
      setError('Something went wrong. Try again.');
      return;
    }
    setInfo((i) => ({ ...i, state: (data as { state: CourierState }).state, delivery: null }));
  };

  const msg = info.state === 'error' ? ERROR_MESSAGE : info.state === 'loading' ? null : COURIER_MESSAGES[info.state];
  const d = info.delivery;
  const address = d ? [d.line1, d.line2, d.city, d.postal_code].filter(Boolean).join(', ') : '';

  const primaryButton = (label: string, onPress: () => void, disabled: boolean, testID: string) => (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => ({
        marginTop: 16,
        height: 50,
        borderRadius: 10,
        backgroundColor: theme.ink,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      {submitting ? (
        <ActivityIndicator color={theme.background} />
      ) : (
        <Text style={{ fontSize: 16, fontFamily: typography.family.sansBold, color: theme.background }}>{label}</Text>
      )}
    </Pressable>
  );

  const line = (label: string, value: string | null | undefined, onPress?: () => void) =>
    value ? (
      <Pressable
        disabled={!onPress}
        onPress={onPress}
        accessibilityRole={onPress ? 'link' : undefined}
        style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.border }}
      >
        <Text style={{ fontSize: 12, color: theme.mute, fontFamily: typography.family.sansSemibold }}>{label}</Text>
        <Text selectable style={{ fontSize: 15, color: theme.ink, marginTop: 2, lineHeight: 21, fontFamily: typography.family.sansMedium }}>
          {value}
        </Text>
      </Pressable>
    ) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <KeyboardAvoider style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 20, paddingBottom: 40, width: '100%', maxWidth: 460, alignSelf: 'center' }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, fontFamily: typography.family.sansSemibold, color: theme.purple }}>{BRAND} riders</Text>
            {info.state !== 'signin' && info.state !== 'forbidden' && info.state !== 'loading' ? (
              <Pressable onPress={() => router.push('/courier' as any)} accessibilityRole="link" hitSlop={8}>
                <Text style={{ fontSize: 13, fontFamily: typography.family.sansSemibold, color: theme.ink }}>My deliveries</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={{ fontSize: 26, fontFamily: typography.family.sansBold, color: theme.ink, marginTop: 6, letterSpacing: -0.5 }}>
            {info.state === 'in_transit' ? 'Deliver order' : 'Confirm pickup'}
          </Text>

          {info.state === 'loading' ? (
            <ActivityIndicator color={theme.mute} style={{ marginTop: 40 }} />
          ) : (
            <>
              {info.title ? (
                <View
                  style={{
                    flexDirection: 'row',
                    gap: 14,
                    marginTop: 20,
                    padding: 12,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.panel,
                  }}
                >
                  <View style={{ width: 64, height: 64, borderRadius: 8, overflow: 'hidden', backgroundColor: theme.surface }}>
                    {info.image ? (
                      <Image source={{ uri: getOptimizedImageUrl(info.image, { width: 160 }) }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    ) : null}
                  </View>
                  <View style={{ flex: 1, justifyContent: 'center' }}>
                    <Text numberOfLines={2} style={{ fontSize: 15, fontFamily: typography.family.sansBold, color: theme.ink }}>
                      {info.title}
                    </Text>
                    <Text style={{ fontSize: 13, color: theme.mute, marginTop: 3 }}>
                      Order #{info.reference}
                      {info.city ? ` · Pickup in ${info.city}` : ''}
                    </Text>
                  </View>
                </View>
              ) : null}

              {msg ? (
                <View testID={`courier-state-${info.state}`} style={{ alignItems: 'center', marginTop: 36, paddingHorizontal: 12 }}>
                  <Feather name={msg.icon as any} size={30} color={theme.ink} />
                  <Text style={{ fontSize: 18, fontFamily: typography.family.sansBold, color: theme.ink, marginTop: 12 }}>{msg.title}</Text>
                  <Text style={{ fontSize: 14, color: theme.mute, marginTop: 6, textAlign: 'center', lineHeight: 20 }}>{msg.body}</Text>
                  {info.state === 'error' || info.state === 'signin' || info.state === 'forbidden' ? (
                    <Pressable
                      onPress={() =>
                        info.state === 'signin' ? router.push('/auth/login' as any) : info.state === 'forbidden' ? router.replace('/' as any) : load()
                      }
                      accessibilityRole="button"
                      style={({ pressed }) => ({
                        marginTop: 16,
                        height: 44,
                        paddingHorizontal: 22,
                        borderRadius: 22,
                        borderWidth: 1,
                        borderColor: theme.border,
                        backgroundColor: theme.panel,
                        justifyContent: 'center',
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Text style={{ fontSize: 14, fontFamily: typography.family.sansSemibold, color: theme.ink }}>
                        {info.state === 'signin' ? 'Sign in' : info.state === 'forbidden' ? `Go to ${BRAND}` : 'Try again'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : info.state === 'in_transit' ? (
                <View testID="courier-delivery" style={{ marginTop: 22 }}>
                  <Text style={{ fontSize: 14, color: theme.ink, lineHeight: 20, marginBottom: 12 }}>
                    You picked this order up. Deliver it to the buyer, then confirm below.
                    {info.cod ? ' This is Cash on Delivery: collect the payment before handing it over.' : ''}
                  </Text>
                  {line('Deliver to', d?.name)}
                  {line('Address', address)}
                  {line('Phone (tap to call)', d?.phone, d?.phone ? () => Linking.openURL(`tel:${d.phone}`).catch(() => {}) : undefined)}
                  {line('Delivery note', d?.notes)}
                  {error ? (
                    <Text style={{ fontSize: 13, color: theme.danger, marginTop: 8, fontFamily: typography.family.sansSemibold }}>{error}</Text>
                  ) : null}
                  {primaryButton('Confirm delivered', submitDelivery, submitting, 'courier-confirm-delivery')}
                </View>
              ) : (
                <View style={{ marginTop: 24 }}>
                  <Text style={{ fontSize: 14, color: theme.ink, lineHeight: 20 }}>
                    Ask the seller for the 6-digit pickup code shown under their Pickup QR code, then enter it here. This locks the order as In Transit and assigns it to you.
                  </Text>
                  <TextInput
                    testID="courier-code-input"
                    value={digits}
                    onChangeText={(t) => {
                      setCode(t);
                      setError(null);
                    }}
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholder="000000"
                    placeholderTextColor={theme.muteSoft}
                    accessibilityLabel="Pickup code"
                    autoFocus
                    style={[
                      {
                        marginTop: 16,
                        height: 64,
                        borderRadius: 12,
                        borderWidth: 1.5,
                        borderColor: error ? theme.danger : theme.border,
                        backgroundColor: theme.panel,
                        textAlign: 'center',
                        fontSize: 30,
                        letterSpacing: 10,
                        color: theme.ink,
                        fontFamily: typography.family.sansBold,
                      },
                      tabularNumberStyle,
                    ]}
                  />
                  {error ? (
                    <Text style={{ fontSize: 13, color: theme.danger, marginTop: 8, fontFamily: typography.family.sansSemibold }}>{error}</Text>
                  ) : null}
                  {primaryButton('Confirm pickup', submitPickup, digits.length !== 6 || submitting, 'courier-confirm')}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoider>
    </SafeAreaView>
  );
}
