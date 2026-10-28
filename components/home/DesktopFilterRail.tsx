import { memo } from 'react';
import { View, Pressable, ScrollView, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Text } from '@/lib/rnText';
import { useTheme } from '@/context/ThemeContext';
import { CATEGORIES } from '@/lib/categories';
import { tabularNumberStyle } from '@/lib/theme';
import {
  EMPTY_FEED_FILTERS,
  FEED_CONDITIONS,
  FEED_PRICE_PRESETS,
  FEED_SIZES,
  FEED_SORTS,
  countActiveFilters,
  type FeedFilters,
} from '@/components/navigation/FeedFilterSheet';
import type { Category, Condition } from '@/types';

// Desktop home: the feed filters as an always-visible column, the way a
// catalogue works on a wide screen. Same FeedFilters state the phone's
// FeedFilterSheet edits, so the two can never disagree.

export const FILTER_RAIL_WIDTH = 220;

type HoverState = { pressed: boolean; hovered?: boolean };

export const DesktopFilterRail = memo(function DesktopFilterRail({
  filters,
  onChange,
  categoryCounts,
  total,
}: {
  filters: FeedFilters;
  onChange: (next: FeedFilters) => void;
  categoryCounts: Record<string, number>;
  total: number;
}) {
  const { theme } = useTheme();
  const active = countActiveFilters(filters) + (filters.sort !== 'relevance' ? 1 : 0);
  const set = (patch: Partial<FeedFilters>) => onChange({ ...filters, ...patch });
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: 20, paddingBottom: 40 }}
      accessibilityLabel="Filters"
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 10 }}>
        <Text style={{ fontSize: 17, fontWeight: '700', letterSpacing: -0.3, color: theme.ink }}>Filters</Text>
        {active > 0 && (
          <Pressable accessibilityRole="button" onPress={() => onChange(EMPTY_FEED_FILTERS)}>
            {(s: HoverState) => (
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: theme.ink,
                  textDecorationLine: s.hovered ? 'underline' : 'none',
                }}
              >
                Clear all ({active})
              </Text>
            )}
          </Pressable>
        )}
      </View>

      <Section title="Sort by">
        {FEED_SORTS.map((o) => (
          <Row
            key={o.id}
            label={o.label}
            selected={filters.sort === o.id}
            kind="radio"
            onPress={() => set({ sort: o.id })}
          />
        ))}
      </Section>

      <Section title="Category">
        <Row
          label="All"
          meta={total}
          selected={filters.category == null}
          kind="radio"
          onPress={() => set({ category: null })}
        />
        {CATEGORIES.map((c) => (
          <Row
            key={c.id}
            label={c.label}
            meta={categoryCounts[c.id] ?? 0}
            selected={filters.category === c.id}
            kind="radio"
            onPress={() => set({ category: c.id as Category })}
          />
        ))}
      </Section>

      <Section title="Price">
        {FEED_PRICE_PRESETS.map((p) => (
          <Row
            key={p.label}
            label={p.label}
            selected={filters.priceMin === p.min && filters.priceMax === p.max}
            kind="radio"
            onPress={() => set({ priceMin: p.min, priceMax: p.max })}
          />
        ))}
      </Section>

      <Section title="Condition">
        {FEED_CONDITIONS.map((c) => (
          <Row
            key={c.id}
            label={c.label}
            selected={filters.conditions.includes(c.id)}
            kind="check"
            onPress={() => set({ conditions: toggle<Condition>(filters.conditions, c.id) })}
          />
        ))}
      </Section>

      <Section title="Size">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 10, paddingTop: 4 }}>
          {FEED_SIZES.map((size) => {
            const on = filters.sizes.includes(size);
            return (
              <Pressable
                key={size}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => set({ sizes: toggle(filters.sizes, size) })}
                style={(s: HoverState) => ({
                  height: 30,
                  minWidth: 40,
                  paddingHorizontal: 12,
                  borderRadius: 15,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: on ? theme.ink : s.hovered ? theme.ink : theme.border,
                  backgroundColor: on ? theme.ink : theme.panel,
                })}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: on ? theme.background : theme.ink }}>{size}</Text>
              </Pressable>
            );
          })}
        </View>
      </Section>
    </ScrollView>
  );
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        marginTop: 20,
        paddingTop: 18,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.border,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          color: theme.textMuted,
          paddingHorizontal: 10,
          marginBottom: 6,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function Row({
  label,
  meta,
  selected,
  kind,
  onPress,
}: {
  label: string;
  meta?: number;
  selected: boolean;
  kind: 'radio' | 'check';
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole={kind === 'radio' ? 'radio' : 'checkbox'}
      accessibilityState={kind === 'radio' ? { selected } : { checked: selected }}
      onPress={onPress}
      style={(s: HoverState) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        height: 34,
        paddingHorizontal: 10,
        borderRadius: 8,
        backgroundColor: s.hovered ? theme.surface : 'transparent',
      })}
    >
      {kind === 'radio' ? (
        <View
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            borderWidth: selected ? 5 : 1.5,
            borderColor: selected ? theme.ink : theme.muteSoft,
          }}
        />
      ) : (
        <View
          style={{
            width: 16,
            height: 16,
            borderRadius: 4,
            borderWidth: 1.5,
            borderColor: selected ? theme.ink : theme.muteSoft,
            backgroundColor: selected ? theme.ink : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {selected && <Feather name="check" size={11} color={theme.background} />}
        </View>
      )}
      <Text
        numberOfLines={1}
        style={{ flex: 1, fontSize: 14, color: theme.ink, fontWeight: selected ? '600' : '400' }}
      >
        {label}
      </Text>
      {meta != null && (
        <Text style={[{ fontSize: 12, color: theme.textMuted }, tabularNumberStyle]}>{meta}</Text>
      )}
    </Pressable>
  );
}
