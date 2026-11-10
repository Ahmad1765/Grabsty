// /courier/<order id> — opened by scanning the seller's Pickup QR code.
// No sign-in: the courier enters the 6-digit pickup code the seller shows
// them, and courier_confirm_pickup locks the order as In Transit. Shows no
// buyer or seller personal details. Wrong codes are counted server-side;
// after 5 the code locks and Grabsty logistics takes over.

import { useCallback, useEffect, useState } from 'react';
import { View, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { type as typography, tabularNumberStyle } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { getOptimizedImageUrl } from '@/lib/images';
import { tap } from '@/lib/haptics';
import { KeyboardAvoider } from '@/components/ui/SafeContainer';
import { BRAND } from '@/lib/brand';

type State = 'loading' | 'ready' | 'in_transit' | 'not_ready' | 'closed' | 'locked' | 'not_found' | 'error' | 'wrong_code';
type Info = {
  state: State;
  reference?: string;
  title?: string | null;
  image?: string | null;
  city?: string | null;
  attempts_left?: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MESSAGES: Record<Exclude<State, 'loading' | 'ready' | 'wrong_code'>, { icon: keyof typeof Feather.glyphMap; title: string; body: string }> = {
  in_transit: { icon: 'truck', title: 'Picked up · in transit', body: 'This order is locked as In Transit. Deliver it to the buyer.' },
  not_ready: { icon: 'clock', title: 'Not ready for pickup', body: "The seller hasn't confirmed Ready to deliver for this order yet." },
  closed: { icon: 'x-circle', title: 'Order closed', body: 'This order was cancelled. Do not collect the item.' },
  locked: { icon: 'lock', title: 'Code locked', body: `Too many wrong codes. Contact ${BRAND} logistics to complete this pickup.` },
  not_found: { icon: 'alert-circle', title: 'Order not found', body: 'This QR code does not match a Grabsty order.' },
  error: { icon: 'wifi-off', title: "Couldn't load the order", body: 'Check your connection and try again.' },
};

export default function CourierPickupScreen() {
  const { theme } = useTheme();
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
    setInfo((i) => ({ ...i, state: 'loading' }));
    const { data, error: rpcError } = await supabase.rpc('courier_pickup_info', { p_order_id: orderId });
    setInfo(rpcError || !data ? { state: 'error' } : (data as Info));
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const digits = code.replace(/[^0-9]/g, '').slice(0, 6);

  const submit = async () => {
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
    const r = data as { ok: boolean; state: State; attempts_left?: number };
    if (r.ok) {
      setInfo((i) => ({ ...i, state: 'in_transit' }));
      return;
    }
    if (r.state === 'wrong_code') {
      setCode('');
      setError(`Wrong code. ${r.attempts_left} ${r.attempts_left === 1 ? 'try' : 'tries'} left.`);
      setInfo((i) => ({ ...i, attempts_left: r.attempts_left }));
      return;
    }
    setInfo((i) => ({ ...i, state: r.state }));
  };

  const msg = info.state !== 'loading' && info.state !== 'ready' && info.state !== 'wrong_code' ? MESSAGES[info.state] : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <KeyboardAvoider style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 20, paddingBottom: 40, width: '100%', maxWidth: 460, alignSelf: 'center' }}
        >
          <Text style={{ fontSize: 13, fontFamily: typography.family.sansSemibold, color: theme.purple }}>
            {BRAND} courier pickup
          </Text>
          <Text style={{ fontSize: 26, fontFamily: typography.family.sansBold, color: theme.ink, marginTop: 6, letterSpacing: -0.5 }}>
            Confirm pickup
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
                      <Image
                        source={{ uri: getOptimizedImageUrl(info.image, { width: 160 }) }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                      />
                    ) : null}
                  </View>
                  <View style={{ flex: 1, justifyContent: 'center' }}>
                    <Text numberOfLines={2} style={{ fontSize: 15, fontFamily: typography.family.sansBold, color: theme.ink }}>
                      {info.title}
                    </Text>
                    <Text style={{ fontSize: 13, color: theme.mute, marginTop: 3 }}>
                      Order {info.reference}
                      {info.city ? ` · Pickup in ${info.city}` : ''}
                    </Text>
                  </View>
                </View>
              ) : null}

              {msg ? (
                <View style={{ alignItems: 'center', marginTop: 36, paddingHorizontal: 12 }}>
                  <Feather name={msg.icon} size={30} color={info.state === 'in_transit' ? theme.purple : theme.ink} />
                  <Text style={{ fontSize: 18, fontFamily: typography.family.sansBold, color: theme.ink, marginTop: 12 }}>
                    {msg.title}
                  </Text>
                  <Text style={{ fontSize: 14, color: theme.mute, marginTop: 6, textAlign: 'center', lineHeight: 20 }}>
                    {msg.body}
                  </Text>
                  {info.state === 'error' ? (
                    <Pressable
                      onPress={load}
                      accessibilityRole="button"
                      style={{ marginTop: 16, height: 44, paddingHorizontal: 20, borderRadius: 10, borderWidth: 1, borderColor: theme.border, justifyContent: 'center' }}
                    >
                      <Text style={{ fontSize: 14, fontFamily: typography.family.sansSemibold, color: theme.ink }}>Try again</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <View style={{ marginTop: 24 }}>
                  <Text style={{ fontSize: 14, color: theme.ink, lineHeight: 20 }}>
                    Ask the seller for the 6-digit pickup code shown under their Pickup QR code, then enter it here. This locks the order as In Transit.
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
                    <Text style={{ fontSize: 13, color: theme.danger, marginTop: 8, fontFamily: typography.family.sansSemibold }}>
                      {error}
                    </Text>
                  ) : null}
                  <Pressable
                    testID="courier-confirm"
                    onPress={submit}
                    disabled={digits.length !== 6 || submitting}
                    accessibilityRole="button"
                    style={({ pressed }) => ({
                      marginTop: 16,
                      height: 50,
                      borderRadius: 10,
                      backgroundColor: theme.ink,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: digits.length !== 6 || submitting ? 0.5 : pressed ? 0.85 : 1,
                    })}
                  >
                    {submitting ? (
                      <ActivityIndicator color={theme.background} />
                    ) : (
                      <Text style={{ fontSize: 16, fontFamily: typography.family.sansBold, color: theme.background }}>
                        Confirm pickup
                      </Text>
                    )}
                  </Pressable>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoider>
    </SafeAreaView>
  );
}
