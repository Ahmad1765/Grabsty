// Admin → Analytics. YouTube Studio-style: metric tabs over a line chart,
// a realtime card, and a top-content table. All data comes from one admin-only
// RPC (supabase/migrations/20261031020000_admin_analytics.sql).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Pressable, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import Svg, { Path, Line, Rect, Circle } from 'react-native-svg';
import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Text } from '@/lib/rnText';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { formatPrice } from '@/lib/fees';
import { CURRENCY_SYMBOL } from '@/lib/currency';
import { SoldBadge } from '@/components/ui/SoldBadge';

type Metric = 'viewers' | 'users' | 'listings' | 'offers' | 'orders' | 'gmv';
type Day = Record<Metric | 'messages', number> & { d: string };
type TopListing = {
  id: string;
  title: string;
  price: number;
  is_sold: boolean;
  views: number;
  likes: number;
  image: string | null;
  period_viewers: number;
};
type Analytics = {
  days: number;
  kpis: Partial<Record<Metric | 'messages', { cur: number; prev: number }>>;
  series: Day[];
  realtime: { hourly: number[]; active_users: number };
  top_listings: TopListing[];
  totals: { users: number; listings: number; live_listings: number };
};

const PERIODS = [7, 28, 90, 365] as const;
const METRICS: { key: Metric; label: string }[] = [
  { key: 'viewers', label: 'Viewers' },
  { key: 'users', label: 'New users' },
  { key: 'listings', label: 'New listings' },
  { key: 'offers', label: 'Offers' },
  { key: 'orders', label: 'Orders' },
  { key: 'gmv', label: 'Sales (GMV)' },
];
const CHART_H = 220;
const DANGER = '#EF4444';

function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`;
  return String(Math.round(n));
}

function fmt(metric: Metric, v: number): string {
  return metric === 'gmv' ? `${CURRENCY_SYMBOL} ${compact(v / 100)}` : compact(v);
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function AdminAnalytics() {
  const { theme, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 1200;
  const [days, setDays] = useState<number>(28);
  const [metric, setMetric] = useState<Metric>('viewers');
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: res, error: err } = await supabase.rpc('admin_analytics', { p_days: days });
    if (err) setError(err.message);
    else {
      setError(null);
      setData(res as Analytics);
    }
    setLoading(false);
  }, [days]);

  useEffect(() => {
    load();
    // Realtime card says "updating live" — refresh once a minute.
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const card = {
    backgroundColor: theme.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
  } as const;

  const rangeLabel = data?.series.length
    ? `${shortDate(data.series[0].d)} – ${shortDate(data.series[data.series.length - 1].d)}`
    : '';

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header: title + period selector */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
        <View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: theme.text, letterSpacing: -0.4 }}>Platform analytics</Text>
          <Text style={{ fontSize: 13, color: theme.textMuted, marginTop: 4 }}>
            {rangeLabel ? `${rangeLabel} · % vs previous ${data?.days} days` : ' '}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', flexShrink: 1, gap: 8, alignItems: 'center' }}>
          {loading && <ActivityIndicator size="small" color={theme.textMuted} />}
          {PERIODS.map((p) => {
            const active = p === days;
            return (
              <Pressable
                key={p}
                testID={`analytics-period-${p}`}
                onPress={() => setDays(p)}
                style={({ pressed }) => ({
                  height: 30,
                  borderRadius: 15,
                  paddingHorizontal: 14,
                  justifyContent: 'center',
                  backgroundColor: active ? theme.ink : theme.surface,
                  borderWidth: 1,
                  borderColor: active ? theme.ink : theme.border,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: active ? theme.background : theme.text }}>
                  {p === 365 ? 'Last year' : `Last ${p} days`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {error && (
        <View style={[card, { padding: 16, marginBottom: 16, borderColor: 'rgba(239,68,68,0.4)' }]}>
          <Text style={{ color: DANGER, fontSize: 13 }}>Could not load analytics: {error}</Text>
        </View>
      )}

      {!data ? (
        !error && <ActivityIndicator style={{ marginTop: 60 }} color={theme.textMuted} />
      ) : (
        <>
          <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16, marginBottom: 16 }}>
            {/* Main card: metric tabs + chart */}
            <View style={[card, { flex: wide ? 2 : undefined, overflow: 'hidden' }]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ flexGrow: 1 }}>
                <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: theme.border, minWidth: '100%' }}>
                  {METRICS.map((m) => {
                    const k = data.kpis[m.key] ?? { cur: 0, prev: 0 };
                    const active = m.key === metric;
                    return (
                      <Pressable
                        key={m.key}
                        testID={`analytics-metric-${m.key}`}
                        onPress={() => setMetric(m.key)}
                        style={({ pressed }) => ({
                          flex: 1,
                          minWidth: 112,
                          paddingHorizontal: 14,
                          paddingTop: 16,
                          paddingBottom: 14,
                          borderTopWidth: 3,
                          borderTopColor: active ? theme.purple : 'transparent',
                          backgroundColor: active ? (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)') : 'transparent',
                          opacity: pressed ? 0.8 : 1,
                        })}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textMuted }} numberOfLines={1}>
                          {m.label}
                        </Text>
                        <Text style={{ fontSize: 24, fontWeight: '800', color: theme.text, marginTop: 6 }} numberOfLines={1}>
                          {fmt(m.key, k.cur)}
                        </Text>
                        <Delta cur={k.cur} prev={k.prev} />
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
              <LineChart series={data.series} metric={metric} />
            </View>

            {/* Realtime card */}
            <View style={[card, { flex: wide ? 1 : undefined, padding: 18 }]}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>Realtime</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.purple }} />
                <Text style={{ fontSize: 12, color: theme.textMuted }}>Updating live</Text>
              </View>
              <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 14 }} />
              <Text style={{ fontSize: 28, fontWeight: '800', color: theme.text }}>{compact(data.realtime.active_users)}</Text>
              <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>Active users · Last 48 hours</Text>
              <HourlyBars values={data.realtime.hourly} />
              <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 6 }}>Activity (views + messages) per hour</Text>
              <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 14 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Stat label="Total users" value={compact(data.totals.users)} />
                <Stat label="Live listings" value={compact(data.totals.live_listings)} />
                <Stat label="Messages" value={compact(data.kpis.messages?.cur ?? 0)} />
              </View>
            </View>
          </View>

          {/* Top content */}
          <View style={card}>
            <View style={{ padding: 18, paddingBottom: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>Top listings in this period</Text>
              <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>Ranked by new viewers</Text>
            </View>
            <View style={{ flexDirection: 'row', paddingHorizontal: 18, paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.border }}>
              <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: theme.textMuted }}>Listing</Text>
              <Text style={{ width: 80, textAlign: 'right', fontSize: 12, fontWeight: '600', color: theme.textMuted }}>Viewers</Text>
              {width >= 600 && (
                <>
                  <Text style={{ width: 80, textAlign: 'right', fontSize: 12, fontWeight: '600', color: theme.textMuted }}>All-time views</Text>
                  <Text style={{ width: 60, textAlign: 'right', fontSize: 12, fontWeight: '600', color: theme.textMuted }}>Likes</Text>
                </>
              )}
              <Text style={{ width: 90, textAlign: 'right', fontSize: 12, fontWeight: '600', color: theme.textMuted }}>Price</Text>
            </View>
            {data.top_listings.length === 0 ? (
              <Text style={{ padding: 18, fontSize: 13, color: theme.textMuted }}>No listing views in this period.</Text>
            ) : (
              data.top_listings.map((l, i) => (
                <Pressable
                  key={l.id}
                  testID={`analytics-top-${l.id}`}
                  onPress={() => router.push(`/product/${l.id}`)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 18,
                    paddingVertical: 10,
                    borderBottomWidth: i === data.top_listings.length - 1 ? 0 : 1,
                    borderBottomColor: theme.border,
                    backgroundColor: pressed ? theme.surface : 'transparent',
                  })}
                >
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Text style={{ width: 18, fontSize: 13, color: theme.textMuted }}>{i + 1}</Text>
                    <View>
                      <Image
                        source={l.image ? { uri: l.image } : undefined}
                        style={{ width: 64, height: 64, borderRadius: 6, backgroundColor: theme.surface }}
                        contentFit="cover"
                      />
                      {l.is_sold && <SoldBadge size="sm" style={{ position: 'absolute', left: 0, bottom: 0 }} />}
                    </View>
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: theme.text }} numberOfLines={2}>
                      {l.title}
                    </Text>
                  </View>
                  <Text style={{ width: 80, textAlign: 'right', fontSize: 14, fontWeight: '700', color: theme.text }}>{compact(l.period_viewers)}</Text>
                  {width >= 600 && (
                    <>
                      <Text style={{ width: 80, textAlign: 'right', fontSize: 14, color: theme.text }}>{compact(l.views ?? 0)}</Text>
                      <Text style={{ width: 60, textAlign: 'right', fontSize: 14, color: theme.text }}>{compact(l.likes ?? 0)}</Text>
                    </>
                  )}
                  <Text style={{ width: 90, textAlign: 'right', fontSize: 14, color: theme.text }}>{formatPrice(l.price, { whole: true })}</Text>
                </Pressable>
              ))
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Delta({ cur, prev }: { cur: number; prev: number }) {
  const { theme } = useTheme();
  if (prev === 0) {
    return <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>{cur > 0 ? 'New' : '—'}</Text>;
  }
  const pct = Math.round(((cur - prev) / prev) * 100);
  const up = pct >= 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
      <Feather name={up ? 'arrow-up' : 'arrow-down'} size={12} color={up ? theme.purple : DANGER} />
      <Text style={{ fontSize: 12, fontWeight: '600', color: up ? theme.purple : DANGER }}>
        {Math.abs(pct)}%
      </Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View>
      <Text style={{ fontSize: 18, fontWeight: '800', color: theme.text }}>{value}</Text>
      <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function LineChart({ series, metric }: { series: Day[]; metric: Metric }) {
  const { theme } = useTheme();
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const PAD_L = 48;
  const PAD_R = 16;
  const PAD_T = 16;
  const PAD_B = 28;

  const values = series.map((d) => d[metric] ?? 0);
  const max = Math.max(1, ...values);
  const plotW = Math.max(0, w - PAD_L - PAD_R);
  const plotH = CHART_H - PAD_T - PAD_B;
  const x = (i: number) => PAD_L + (series.length <= 1 ? plotW / 2 : (i / (series.length - 1)) * plotW);
  const y = (v: number) => PAD_T + plotH - (v / max) * plotH;

  const line = useMemo(
    () => values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values.join(','), w],
  );
  const area = values.length ? `${line} L${x(values.length - 1)},${PAD_T + plotH} L${x(0)},${PAD_T + plotH} Z` : '';

  const pick = (px: number) => {
    if (!series.length || plotW <= 0) return;
    const i = Math.round(((px - PAD_L) / plotW) * (series.length - 1));
    setHover(Math.min(series.length - 1, Math.max(0, i)));
  };

  const ticks = [0, 0.5, 1].map((f) => max * f);
  const labelIdx = series.length > 1 ? [0, Math.floor((series.length - 1) / 2), series.length - 1] : [0];

  return (
    <View
      style={{ height: CHART_H, marginTop: 8 }}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onResponderGrant={(e) => pick(e.nativeEvent.locationX)}
      onResponderMove={(e) => pick(e.nativeEvent.locationX)}
      onResponderRelease={() => setHover(null)}
      {...({
        onPointerMove: (e: any) => pick(e.nativeEvent.offsetX ?? e.nativeEvent.locationX),
        onPointerLeave: () => setHover(null),
      } as object)}
    >
      {w > 0 && (
        <Svg width={w} height={CHART_H}>
          {ticks.map((t) => (
            <Line key={t} x1={PAD_L} x2={w - PAD_R} y1={y(t)} y2={y(t)} stroke={theme.border} strokeWidth={1} />
          ))}
          <Path d={area} fill={theme.purpleSoft} />
          <Path d={line} stroke={theme.purple} strokeWidth={2} fill="none" strokeLinejoin="round" />
          {hover != null && (
            <>
              <Line x1={x(hover)} x2={x(hover)} y1={PAD_T} y2={PAD_T + plotH} stroke={theme.textMuted} strokeWidth={1} />
              <Circle cx={x(hover)} cy={y(values[hover])} r={4} fill={theme.purple} stroke={theme.panel} strokeWidth={2} />
            </>
          )}
        </Svg>
      )}
      {ticks.map((t) => (
        <Text
          key={t}
          style={{ position: 'absolute', left: 0, width: PAD_L - 8, textAlign: 'right', top: y(t) - 8, fontSize: 11, color: theme.textMuted }}
        >
          {fmt(metric, t)}
        </Text>
      ))}
      {w > 0 &&
        labelIdx.map((i) => (
          <Text
            key={i}
            style={{ position: 'absolute', top: CHART_H - 20, left: Math.min(Math.max(x(i) - 30, 0), w - 60), width: 60, textAlign: 'center', fontSize: 11, color: theme.textMuted }}
          >
            {series[i] ? shortDate(series[i].d) : ''}
          </Text>
        ))}
      {hover != null && series[hover] && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 4,
            left: Math.min(Math.max(x(hover) - 70, 0), w - 140),
            width: 140,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 8,
            backgroundColor: theme.ink,
          }}
        >
          <Text style={{ fontSize: 11, color: theme.background, opacity: 0.75 }}>{shortDate(series[hover].d)}</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: theme.background }}>{fmt(metric, values[hover])}</Text>
        </View>
      )}
    </View>
  );
}

function HourlyBars({ values }: { values: number[] }) {
  const { theme } = useTheme();
  const [w, setW] = useState(0);
  const H = 64;
  const max = Math.max(1, ...values);
  const slot = values.length ? w / values.length : 0;
  return (
    <View style={{ height: H, marginTop: 14 }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && (
        <Svg width={w} height={H}>
          {values.map((v, i) => {
            const h = v ? Math.max(2, (v / max) * H) : 1;
            return (
              <Rect
                key={i}
                x={i * slot + 1}
                y={H - h}
                width={Math.max(1, slot - 2)}
                height={h}
                fill={v ? theme.purple : theme.border}
              />
            );
          })}
        </Svg>
      )}
    </View>
  );
}
