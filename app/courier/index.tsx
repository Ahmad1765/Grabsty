// /courier — the rider dashboard home: what this rider is carrying and what
// they delivered recently. Riders only (rider_deliveries checks the account).
// Pickups start by scanning a seller's Pickup QR, which opens /courier/<id>.

import { useCallback, useEffect, useState } from 'react';
import { View, Pressable, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { type as typography } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { getOptimizedImageUrl } from '@/lib/images';
import { tap } from '@/lib/haptics';
import { BRAND } from '@/lib/brand';
import { timeAgo } from '@/components/product/shared';
import { COURIER_MESSAGES, cashToCollect, groupRiderDeliveries, type RiderDelivery } from '@/lib/orderTracking';

type Data = { state: 'loading' | 'ok' | 'signin' | 'forbidden' | 'error'; items: RiderDelivery[] };

const ROW_LABEL: Record<RiderDelivery['state'], string> = {
  to_pick_up: 'To pick up',
  in_transit: 'To deliver',
  delivered: 'Delivered',
  on_hold: 'On hold',
  closed: 'Cancelled',
};

export default function RiderDashboard() {
  const { theme } = useTheme();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<Data>({ state: 'loading', items: [] });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    // Signed out: the rider functions aren't callable at all, so don't try.
    if (authLoading) return;
    if (!user?.id) {
      setData({ state: 'signin', items: [] });
      return;
    }
    const { data: res, error } = await supabase.rpc('rider_deliveries');
    if (error || !res) setData({ state: 'error', items: [] });
    else setData({ state: (res as any).state, items: ((res as any).items ?? []) as RiderDelivery[] });
  }, [user?.id, authLoading]);

  // Reload when the account changes (signing in on this device).
  useEffect(() => {
    load();
  }, [load]);

  const gate = data.state === 'signin' || data.state === 'forbidden' ? COURIER_MESSAGES[data.state] : null;
  const { toPickUp, toDeliver: active, past } = groupRiderDeliveries(data.items);

  const header = (label: string, marginTop = 24) => (
    <Text style={{ fontSize: 13, fontFamily: typography.family.sansSemibold, color: theme.ink, marginTop }}>{label}</Text>
  );
  // Waiting for pickup or in transit: show the cash to collect, not an age.
  const isOpen = (i: RiderDelivery) => i.active || i.state === 'to_pick_up';

  const row = (i: RiderDelivery) => (
    <Pressable
      key={i.id}
      testID="rider-delivery-row"
      onPress={() => {
        tap('light');
        router.push(`/courier/${i.id}` as any);
      }}
      accessibilityRole="button"
      accessibilityLabel={`${i.title ?? 'Order'} ${ROW_LABEL[i.state]}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: pressed ? theme.surface : theme.panel,
        marginTop: 10,
      })}
    >
      <View style={{ width: 52, height: 52, borderRadius: 8, overflow: 'hidden', backgroundColor: theme.surface }}>
        {i.image ? (
          <Image source={{ uri: getOptimizedImageUrl(i.image, { width: 160 }) }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, fontFamily: typography.family.sansBold, color: theme.ink }}>
          {i.title ?? 'Order'}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 13, color: theme.mute, marginTop: 3 }}>
          Order #{i.reference}
          {i.city ? ` · ${i.city}` : ''} · {ROW_LABEL[i.state]} {isOpen(i) ? '' : timeAgo(i.at)}
        </Text>
        {isOpen(i)
          ? ((cash) =>
              cash ? (
                <Text numberOfLines={1} style={{ fontSize: 13, color: theme.ink, marginTop: 3, fontFamily: typography.family.sansSemibold }}>
                  {cash}
                </Text>
              ) : null)(cashToCollect(i.collect))
          : null}
      </View>
      <Feather name="chevron-right" size={18} color={theme.mute} />
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40, width: '100%', maxWidth: 520, alignSelf: 'center' }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={theme.purple}
          />
        }
      >
        <Text style={{ fontSize: 13, fontFamily: typography.family.sansSemibold, color: theme.purple }}>{BRAND} riders</Text>
        <Text style={{ fontSize: 26, fontFamily: typography.family.sansBold, color: theme.ink, marginTop: 6, letterSpacing: -0.5 }}>
          My deliveries
        </Text>

        {data.state === 'loading' ? (
          <ActivityIndicator color={theme.mute} style={{ marginTop: 40 }} />
        ) : gate || data.state === 'error' ? (
          <View testID={`rider-gate-${data.state}`} style={{ alignItems: 'center', marginTop: 40, paddingHorizontal: 12 }}>
            <Feather name={(gate?.icon ?? 'wifi-off') as any} size={30} color={theme.ink} />
            <Text style={{ fontSize: 18, fontFamily: typography.family.sansBold, color: theme.ink, marginTop: 12 }}>
              {gate?.title ?? "Couldn't load your deliveries"}
            </Text>
            <Text style={{ fontSize: 14, color: theme.mute, marginTop: 6, textAlign: 'center', lineHeight: 20 }}>
              {gate?.body ?? 'Check your connection and try again.'}
            </Text>
            <Pressable
              onPress={() => (data.state === 'signin' ? router.push('/auth/login' as any) : data.state === 'forbidden' ? router.replace('/' as any) : load())}
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
                {data.state === 'signin' ? 'Sign in' : data.state === 'forbidden' ? 'Go to Grabsty' : 'Try again'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={{ fontSize: 14, color: theme.mute, marginTop: 8, lineHeight: 20 }}>
              To pick up an order, scan the seller&apos;s Pickup QR code with your phone camera.
            </Text>
            {toPickUp.length ? (
              <>
                {header(`To pick up (${toPickUp.length})`)}
                {toPickUp.map(row)}
              </>
            ) : null}
            {header(`To deliver (${active.length})`)}
            {active.length ? (
              active.map(row)
            ) : (
              <Text style={{ fontSize: 14, color: theme.mute, marginTop: 8 }}>Nothing in transit with you right now.</Text>
            )}
            {past.length ? (
              <>
                {header('Last 30 days', 28)}
                {past.map(row)}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
