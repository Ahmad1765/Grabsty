import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  Platform,
  StyleSheet,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { BottomSheetModal } from '@/components/ui/BottomSheetModal';
import { Text, TextInput } from '@/lib/rnText';
import { radii, type, ThemeTokens } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { CURRENCY_SYMBOL } from '@/lib/currency';
import type { Category, Condition } from '@/types';

export type FeedSort = 'relevance' | 'newest' | 'price_asc' | 'price_desc' | 'popular';

export interface FeedFilters {
  category: Category | null;
  conditions: Condition[];
  sizes: string[];
  priceMin: number | null;
  priceMax: number | null;
  sort: FeedSort;
}

export const EMPTY_FEED_FILTERS: FeedFilters = {
  category: null,
  conditions: [],
  sizes: [],
  priceMin: null,
  priceMax: null,
  sort: 'relevance',
};

export function countActiveFilters(f: FeedFilters): number {
  let count = 0;
  if (f.category) count += 1;
  count += f.conditions.length;
  count += f.sizes.length;
  if (f.priceMin != null || f.priceMax != null) count += 1;
  return count;
}

const CATEGORIES: { id: Category; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { id: 'clothing', label: 'Clothing', icon: 'layers' },
  { id: 'shoes', label: 'Shoes', icon: 'box' },
  { id: 'bags', label: 'Bags', icon: 'briefcase' },
  { id: 'accessories', label: 'Accessories', icon: 'watch' },
  { id: 'beauty', label: 'Beauty', icon: 'droplet' },
  { id: 'other', label: 'Other', icon: 'grid' },
];

export const FEED_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'One Size'];

export const FEED_CONDITIONS: { id: Condition; label: string }[] = [
  { id: 'new_with_tags', label: 'New with tags' },
  { id: 'like_new', label: 'Like new' },
  { id: 'good', label: 'Good' },
  { id: 'fair', label: 'Fair' },
];

export const FEED_SORTS: { id: FeedSort; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { id: 'relevance', label: 'Recommended', icon: 'star' },
  { id: 'newest', label: 'Newest', icon: 'clock' },
  { id: 'price_asc', label: 'Price: Low to High', icon: 'trending-up' },
  { id: 'price_desc', label: 'Price: High to Low', icon: 'trending-down' },
  { id: 'popular', label: 'Most Liked', icon: 'heart' },
];

// Listing prices are whole rupees (Rs 2,000-5,000 is typical), so the bands
// are too. These were Rs 25 / 50 / 100, left over from a USD build, and
// "Under Rs 25" matched nothing.
export const FEED_PRICE_PRESETS: { label: string; min: number | null; max: number | null }[] = [
  { label: 'All', min: null, max: null },
  { label: `Under ${CURRENCY_SYMBOL} 2,000`, min: null, max: 2000 },
  { label: `${CURRENCY_SYMBOL} 2,000 - 5,000`, min: 2000, max: 5000 },
  { label: `${CURRENCY_SYMBOL} 5,000 - 10,000`, min: 5000, max: 10000 },
  { label: `${CURRENCY_SYMBOL} 10,000+`, min: 10000, max: null },
];

export interface FeedFilterSheetProps {
  visible: boolean;
  initial?: FeedFilters;
  onClose: () => void;
  onApply: (filters: FeedFilters) => void;
  resultCount?: number;
}

/**
 * Editorial Discovery Filter Bottom Sheet.
 * Inspired by Mercari's calm, structured list hierarchy:
 * - Centered "Filters" header with left ✕ dismiss and right "Clear all"
 * - Clean structured rows with live summaries and chevrons
 * - Expandable accordion drawers for zero-clutter scanning
 * - Single prominent Signal Purple bottom CTA button
 */
export function FeedFilterSheet({
  visible,
  initial = EMPTY_FEED_FILTERS,
  onClose,
  onApply,
  resultCount,
}: FeedFilterSheetProps) {
  const { theme, isDark } = useTheme();
  const [filters, setFilters] = useState<FeedFilters>(initial);
  const prevVisibleRef = React.useRef(visible);
  const [minFocused, setMinFocused] = useState(false);
  const [maxFocused, setMaxFocused] = useState(false);

  // Track accordion state for each row
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    sort: false,
    category: false,
    size: false,
    price: false,
    condition: false,
  });

  // Sync with initial whenever sheet opens
  React.useEffect(() => {
    if (!prevVisibleRef.current && visible) {
      setFilters(initial);
      // Auto-expand category if active, otherwise keep clean collapsed
      setExpandedSections({
        sort: false,
        category: Boolean(initial.category),
        size: initial.sizes.length > 0,
        price: initial.priceMin != null || initial.priceMax != null,
        condition: initial.conditions.length > 0,
      });
    }
    prevVisibleRef.current = visible;
  }, [visible, initial]);

  const activeCount = useMemo(() => countActiveFilters(filters), [filters]);

  const isDirty = useMemo(() => {
    return (
      filters.category !== initial.category ||
      filters.sort !== initial.sort ||
      filters.priceMin !== initial.priceMin ||
      filters.priceMax !== initial.priceMax ||
      filters.conditions.length !== initial.conditions.length ||
      filters.sizes.length !== initial.sizes.length ||
      filters.conditions.some((c) => !initial.conditions.includes(c)) ||
      filters.sizes.some((s) => !initial.sizes.includes(s))
    );
  }, [filters, initial]);

  const triggerHaptic = useCallback((type: 'selection' | 'impact' = 'selection') => {
    if (Platform.OS !== 'web') {
      if (type === 'selection') {
        Haptics.selectionAsync().catch(() => {});
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }
    }
  }, []);

  const toggleSection = useCallback((key: string) => {
    triggerHaptic('selection');
    setExpandedSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, [triggerHaptic]);

  const toggleCategory = useCallback((cat: Category) => {
    triggerHaptic('selection');
    setFilters((prev) => ({
      ...prev,
      category: prev.category === cat ? null : cat,
    }));
  }, [triggerHaptic]);

  const toggleCondition = useCallback((cond: Condition) => {
    triggerHaptic('selection');
    setFilters((prev) => {
      const exists = prev.conditions.includes(cond);
      return {
        ...prev,
        conditions: exists
          ? prev.conditions.filter((c) => c !== cond)
          : [...prev.conditions, cond],
      };
    });
  }, [triggerHaptic]);

  const toggleSize = useCallback((size: string) => {
    triggerHaptic('selection');
    setFilters((prev) => {
      const exists = prev.sizes.includes(size);
      return {
        ...prev,
        sizes: exists
          ? prev.sizes.filter((s) => s !== size)
          : [...prev.sizes, size],
      };
    });
  }, [triggerHaptic]);

  const handleApplyPreset = useCallback((min: number | null, max: number | null) => {
    triggerHaptic('selection');
    setFilters((prev) => ({
      ...prev,
      priceMin: min,
      priceMax: max,
    }));
  }, [triggerHaptic]);

  const handleReset = useCallback(() => {
    triggerHaptic('impact');
    setFilters(EMPTY_FEED_FILTERS);
  }, [triggerHaptic]);

  const handleApply = useCallback(() => {
    triggerHaptic('impact');
    let appliedFilters = filters;
    if (
      filters.priceMin != null &&
      filters.priceMax != null &&
      filters.priceMin > filters.priceMax
    ) {
      appliedFilters = {
        ...filters,
        priceMin: filters.priceMax,
        priceMax: filters.priceMin,
      };
      setFilters(appliedFilters);
    }
    onApply(appliedFilters);
    onClose();
  }, [filters, onApply, onClose, triggerHaptic]);

  const hasPriceConflict =
    filters.priceMin != null &&
    filters.priceMax != null &&
    filters.priceMin > filters.priceMax;

  // Summaries for list row right side
  const sortSummary = useMemo(() => {
    const s = FEED_SORTS.find((item) => item.id === filters.sort);
    return s ? s.label : 'Recommended';
  }, [filters.sort]);

  const categorySummary = useMemo(() => {
    if (!filters.category) return 'Any';
    const c = CATEGORIES.find((item) => item.id === filters.category);
    return c ? c.label : 'Any';
  }, [filters.category]);

  const sizeSummary = useMemo(() => {
    if (filters.sizes.length === 0) return 'Any';
    if (filters.sizes.length <= 2) return filters.sizes.join(', ');
    return `${filters.sizes.length} selected`;
  }, [filters.sizes]);

  const priceSummary = useMemo(() => {
    if (filters.priceMin != null && filters.priceMax != null) {
      return `${CURRENCY_SYMBOL}${filters.priceMin} - ${CURRENCY_SYMBOL}${filters.priceMax}`;
    }
    if (filters.priceMin != null) return `From ${CURRENCY_SYMBOL}${filters.priceMin}`;
    if (filters.priceMax != null) return `Up to ${CURRENCY_SYMBOL}${filters.priceMax}`;
    return 'Any';
  }, [filters.priceMin, filters.priceMax]);

  const conditionSummary = useMemo(() => {
    if (filters.conditions.length === 0) return 'Any';
    if (filters.conditions.length === 1) {
      const c = FEED_CONDITIONS.find((item) => item.id === filters.conditions[0]);
      return c ? c.label : '1 selected';
    }
    return `${filters.conditions.length} selected`;
  }, [filters.conditions]);

  const buttonLabel = useMemo(() => {
    if (resultCount !== undefined && !isDirty) {
      return `Show results (${resultCount})`;
    }
    return 'Show results';
  }, [resultCount, isDirty]);

  // Dynamic Theme-Aware Styles
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const activeChipTextColor = isDark ? '#111111' : '#FFFFFF';

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      snapHeightRatio={0.9}
      scrollable
      sheetBackgroundColor={theme.panel}
      contentPaddingHorizontal={0}
      customHeader={
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.headerCloseButton}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Feather name="x" size={20} color={theme.ink} />
          </Pressable>

          <Text style={styles.headerTitle}>Filters</Text>

          <Pressable
            onPress={handleReset}
            disabled={activeCount === 0}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.headerClearButton}
            accessibilityRole="button"
            accessibilityLabel="Clear all filters"
          >
            <Text
              style={[
                styles.headerClearText,
                { color: activeCount > 0 ? theme.purple : theme.muteSoft },
              ]}
            >
              Clear all
            </Text>
          </Pressable>
        </View>
      }
      footer={
        <View style={styles.footerContainer}>
          <Pressable
            onPress={handleApply}
            style={({ pressed }) => [
              styles.primaryApplyButton,
              { transform: [{ scale: pressed ? 0.98 : 1 }] },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Apply filters and close"
          >
            <Text style={styles.primaryApplyText}>{buttonLabel}</Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.listContainer}>
        {/* 1. Sort By Row */}
        <View style={styles.rowWrapper}>
          <Pressable
            onPress={() => toggleSection('sort')}
            style={({ pressed }) => [
              styles.rowItem,
              { backgroundColor: pressed ? theme.surface : theme.panel },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Toggle Sort by filter"
          >
            <Text style={styles.rowTitle}>Sort by</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>{sortSummary}</Text>
              <Feather
                name={expandedSections.sort ? 'chevron-down' : 'chevron-right'}
                size={18}
                color={theme.muteSoft}
              />
            </View>
          </Pressable>

          {expandedSections.sort && (
            <View style={styles.drawerContent}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollRow}
              >
                {FEED_SORTS.map((sortOption) => {
                  const active = filters.sort === sortOption.id;
                  return (
                    <Pressable
                      key={sortOption.id}
                      onPress={() => {
                        triggerHaptic('selection');
                        setFilters((prev) => ({ ...prev, sort: sortOption.id }));
                      }}
                      style={({ pressed }) => [
                        styles.chip,
                        active ? styles.chipActive : styles.chipInactive,
                        { transform: [{ scale: pressed ? 0.96 : 1 }] },
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                    >
                      <Feather
                        name={sortOption.icon}
                        size={13}
                        color={active ? activeChipTextColor : theme.ink}
                      />
                      <Text
                        style={[
                          styles.chipText,
                          {
                            color: active ? activeChipTextColor : theme.ink,
                            fontFamily: active
                              ? type.family.sansBold
                              : type.family.sansMedium,
                            fontWeight: active ? '700' : '500',
                          },
                        ]}
                      >
                        {sortOption.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}
          <View style={styles.hairlineDivider} />
        </View>

        {/* 2. Size Row */}
        <View style={styles.rowWrapper}>
          <Pressable
            onPress={() => toggleSection('size')}
            style={({ pressed }) => [
              styles.rowItem,
              { backgroundColor: pressed ? theme.surface : theme.panel },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Toggle Size filter"
          >
            <Text style={styles.rowTitle}>Size</Text>
            <View style={styles.rowRight}>
              <Text
                style={[
                  styles.rowValue,
                  filters.sizes.length > 0 && styles.rowValueActive,
                ]}
              >
                {sizeSummary}
              </Text>
              <Feather
                name={expandedSections.size ? 'chevron-down' : 'chevron-right'}
                size={18}
                color={theme.muteSoft}
              />
            </View>
          </Pressable>

          {expandedSections.size && (
            <View style={styles.drawerContent}>
              <View style={styles.wrapGrid}>
                {FEED_SIZES.map((size) => {
                  const active = filters.sizes.includes(size);
                  return (
                    <Pressable
                      key={size}
                      onPress={() => toggleSize(size)}
                      style={({ pressed }) => [
                        styles.sizeChip,
                        active ? styles.chipActive : styles.chipInactive,
                        { transform: [{ scale: pressed ? 0.95 : 1 }] },
                      ]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: active }}
                    >
                      <Text
                        style={[
                          styles.sizeChipText,
                          {
                            color: active ? activeChipTextColor : theme.ink,
                            fontFamily: active
                              ? type.family.sansBold
                              : type.family.sansMedium,
                            fontWeight: active ? '700' : '500',
                          },
                        ]}
                      >
                        {size}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
          <View style={styles.hairlineDivider} />
        </View>

        {/* 3. Price Row */}
        <View style={styles.rowWrapper}>
          <Pressable
            onPress={() => toggleSection('price')}
            style={({ pressed }) => [
              styles.rowItem,
              { backgroundColor: pressed ? theme.surface : theme.panel },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Toggle Price filter"
          >
            <Text style={styles.rowTitle}>Price</Text>
            <View style={styles.rowRight}>
              <Text
                style={[
                  styles.rowValue,
                  (filters.priceMin != null || filters.priceMax != null) &&
                    styles.rowValueActive,
                ]}
              >
                {priceSummary}
              </Text>
              <Feather
                name={expandedSections.price ? 'chevron-down' : 'chevron-right'}
                size={18}
                color={theme.muteSoft}
              />
            </View>
          </Pressable>

          {expandedSections.price && (
            <View style={styles.drawerContent}>
              {/* Preset Chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollRow}
              >
                {FEED_PRICE_PRESETS.map((preset, index) => {
                  const isMatch =
                    filters.priceMin === preset.min &&
                    filters.priceMax === preset.max;
                  return (
                    <Pressable
                      key={index}
                      onPress={() => handleApplyPreset(preset.min, preset.max)}
                      style={({ pressed }) => [
                        styles.chip,
                        isMatch ? styles.chipActive : styles.chipInactive,
                        { transform: [{ scale: pressed ? 0.96 : 1 }] },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          {
                            color: isMatch ? activeChipTextColor : theme.ink,
                            fontFamily: isMatch
                              ? type.family.sansBold
                              : type.family.sansMedium,
                            fontWeight: isMatch ? '700' : '500',
                          },
                        ]}
                      >
                        {preset.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Custom Min/Max Inputs */}
              <View style={styles.priceRow}>
                <View
                  style={[
                    styles.priceInputWrapper,
                    minFocused && styles.priceInputWrapperFocused,
                  ]}
                >
                  <Text style={styles.priceInputPrefix}>{CURRENCY_SYMBOL}</Text>
                  <TextInput
                    value={filters.priceMin != null ? String(filters.priceMin) : ''}
                    onChangeText={(text) => {
                      const n = parseInt(text.replace(/[^0-9]/g, ''), 10);
                      setFilters((prev) => ({
                        ...prev,
                        priceMin: isNaN(n) ? null : n,
                      }));
                    }}
                    onFocus={() => setMinFocused(true)}
                    onBlur={() => setMinFocused(false)}
                    placeholder="Min"
                    placeholderTextColor={theme.muteSoft}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    style={styles.priceInput}
                  />
                  {filters.priceMin != null && (
                    <Pressable
                      onPress={() => setFilters((prev) => ({ ...prev, priceMin: null }))}
                      hitSlop={8}
                      style={styles.inputClearButton}
                      accessibilityLabel="Clear minimum price"
                    >
                      <Feather name="x" size={12} color={theme.mute} />
                    </Pressable>
                  )}
                </View>

                <Text style={styles.priceDivider}>to</Text>

                <View
                  style={[
                    styles.priceInputWrapper,
                    maxFocused && styles.priceInputWrapperFocused,
                  ]}
                >
                  <Text style={styles.priceInputPrefix}>{CURRENCY_SYMBOL}</Text>
                  <TextInput
                    value={filters.priceMax != null ? String(filters.priceMax) : ''}
                    onChangeText={(text) => {
                      const n = parseInt(text.replace(/[^0-9]/g, ''), 10);
                      setFilters((prev) => ({
                        ...prev,
                        priceMax: isNaN(n) ? null : n,
                      }));
                    }}
                    onFocus={() => setMaxFocused(true)}
                    onBlur={() => setMaxFocused(false)}
                    placeholder="Max"
                    placeholderTextColor={theme.muteSoft}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    style={styles.priceInput}
                  />
                  {filters.priceMax != null && (
                    <Pressable
                      onPress={() => setFilters((prev) => ({ ...prev, priceMax: null }))}
                      hitSlop={8}
                      style={styles.inputClearButton}
                      accessibilityLabel="Clear maximum price"
                    >
                      <Feather name="x" size={12} color={theme.mute} />
                    </Pressable>
                  )}
                </View>
              </View>

              {hasPriceConflict && (
                <View style={styles.priceWarningRow}>
                  <Feather name="info" size={12} color={theme.purple} />
                  <Text style={styles.priceWarningText}>
                    Min is greater than Max (will auto-adjust on apply)
                  </Text>
                </View>
              )}
            </View>
          )}
          <View style={styles.hairlineDivider} />
        </View>

        {/* 4. Condition Row */}
        <View style={styles.rowWrapper}>
          <Pressable
            onPress={() => toggleSection('condition')}
            style={({ pressed }) => [
              styles.rowItem,
              { backgroundColor: pressed ? theme.surface : theme.panel },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Toggle Condition filter"
          >
            <Text style={styles.rowTitle}>Condition</Text>
            <View style={styles.rowRight}>
              <Text
                style={[
                  styles.rowValue,
                  filters.conditions.length > 0 && styles.rowValueActive,
                ]}
              >
                {conditionSummary}
              </Text>
              <Feather
                name={expandedSections.condition ? 'chevron-down' : 'chevron-right'}
                size={18}
                color={theme.muteSoft}
              />
            </View>
          </Pressable>

          {expandedSections.condition && (
            <View style={styles.drawerContent}>
              <View style={styles.wrapGrid}>
                {FEED_CONDITIONS.map((cond) => {
                  const active = filters.conditions.includes(cond.id);
                  return (
                    <Pressable
                      key={cond.id}
                      onPress={() => toggleCondition(cond.id)}
                      style={({ pressed }) => [
                        styles.chip,
                        active ? styles.chipActive : styles.chipInactive,
                        { transform: [{ scale: pressed ? 0.96 : 1 }] },
                      ]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: active }}
                    >
                      {active && (
                        <Feather
                          name="check"
                          size={12}
                          color={activeChipTextColor}
                          style={{ marginRight: 2 }}
                        />
                      )}
                      <Text
                        style={[
                          styles.chipText,
                          {
                            color: active ? activeChipTextColor : theme.ink,
                            fontFamily: active
                              ? type.family.sansBold
                              : type.family.sansMedium,
                            fontWeight: active ? '700' : '500',
                          },
                        ]}
                      >
                        {cond.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
          <View style={styles.hairlineDivider} />
        </View>

        {/* 5. Category Row */}
        <View style={styles.rowWrapper}>
          <Pressable
            onPress={() => toggleSection('category')}
            style={({ pressed }) => [
              styles.rowItem,
              { backgroundColor: pressed ? theme.surface : theme.panel },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Toggle Category filter"
          >
            <Text style={styles.rowTitle}>Category</Text>
            <View style={styles.rowRight}>
              <Text
                style={[
                  styles.rowValue,
                  Boolean(filters.category) && styles.rowValueActive,
                ]}
              >
                {categorySummary}
              </Text>
              <Feather
                name={expandedSections.category ? 'chevron-down' : 'chevron-right'}
                size={18}
                color={theme.muteSoft}
              />
            </View>
          </Pressable>

          {expandedSections.category && (
            <View style={styles.drawerContent}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollRow}
              >
                {CATEGORIES.map((cat) => {
                  const active = filters.category === cat.id;
                  return (
                    <Pressable
                      key={cat.id}
                      onPress={() => toggleCategory(cat.id)}
                      style={({ pressed }) => [
                        styles.chip,
                        active ? styles.chipActive : styles.chipInactive,
                        { transform: [{ scale: pressed ? 0.96 : 1 }] },
                      ]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: active }}
                    >
                      <Feather
                        name={cat.icon}
                        size={13}
                        color={active ? activeChipTextColor : theme.ink}
                      />
                      <Text
                        style={[
                          styles.chipText,
                          {
                            color: active ? activeChipTextColor : theme.ink,
                            fontFamily: active
                              ? type.family.sansBold
                              : type.family.sansMedium,
                            fontWeight: active ? '700' : '500',
                          },
                        ]}
                      >
                        {cat.label}
                      </Text>
                      {active && (
                        <Feather
                          name="check"
                          size={12}
                          color={activeChipTextColor}
                          style={{ marginLeft: 2 }}
                        />
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}
          <View style={styles.hairlineDivider} />
        </View>
      </View>
    </BottomSheetModal>
  );
}

function createStyles(theme: ThemeTokens, isDark: boolean) {
  const inactiveChipBg = isDark ? 'rgba(255, 255, 255, 0.08)' : '#FFFFFF';
  const inactiveChipBorder = isDark
    ? 'rgba(255, 255, 255, 0.12)'
    : 'rgba(0, 0, 0, 0.08)';
  const activeChipBg = isDark ? '#FFFFFF' : '#0F0F0F';
  const activeChipBorder = isDark ? '#FFFFFF' : '#0F0F0F';
  const inputBg = isDark ? '#1E1E20' : '#FFFFFF';
  const inputBorder = isDark
    ? 'rgba(255, 255, 255, 0.12)'
    : 'rgba(0, 0, 0, 0.12)';

  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.hairline,
    },
    headerCloseButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.05)',
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: -2,
    },
    headerTitle: {
      fontSize: 17,
      fontFamily: type.family.sansSemibold,
      fontWeight: '600',
      color: theme.ink,
      letterSpacing: -0.3,
    },
    headerClearButton: {
      minWidth: 60,
      alignItems: 'flex-end',
      justifyContent: 'center',
      paddingVertical: 6,
      marginRight: -4,
    },
    headerClearText: {
      fontSize: 14,
      fontFamily: type.family.sansSemibold,
      fontWeight: '600',
    },
    footerContainer: {
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 6,
    },
    primaryApplyButton: {
      height: 50,
      borderRadius: 14,
      backgroundColor: isDark ? '#FFFFFF' : '#0F0F0F',
      alignItems: 'center',
      justifyContent: 'center',
      ...Platform.select({
        ios: {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isDark ? 0 : 0.08,
          shadowRadius: 8,
        },
        android: {
          elevation: isDark ? 0 : 2,
        },
        default: {
          boxShadow: isDark ? 'none' : '0 2px 10px rgba(0, 0, 0, 0.08)',
        },
      }),
    },
    primaryApplyText: {
      fontSize: 15.5,
      fontFamily: type.family.sansSemibold,
      fontWeight: '600',
      color: isDark ? '#0F0F0F' : '#FFFFFF',
      letterSpacing: -0.3,
    },
    listContainer: {
      paddingBottom: 24,
    },
    rowWrapper: {
      width: '100%',
    },
    rowItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 18,
    },
    rowTitle: {
      fontSize: 15.5,
      fontFamily: type.family.sansBold,
      fontWeight: '700',
      color: theme.ink,
      letterSpacing: -0.2,
    },
    rowRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    rowValue: {
      fontSize: 14.5,
      fontFamily: type.family.sans,
      color: theme.mute,
      letterSpacing: -0.1,
    },
    rowValueActive: {
      fontFamily: type.family.sansMedium,
      color: theme.ink,
      fontWeight: '600',
    },
    hairlineDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.hairline,
      marginLeft: 20,
    },
    drawerContent: {
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: 18,
      gap: 12,
    },
    scrollRow: {
      flexDirection: 'row',
      gap: 8,
      paddingVertical: 4,
    },
    wrapGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingVertical: 4,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      height: 30,
      paddingHorizontal: 12,
      borderRadius: radii.pill,
      borderWidth: 1,
    },
    sizeChip: {
      minWidth: 44,
      height: 30,
      paddingHorizontal: 10,
      borderRadius: radii.pill,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sizeChipText: {
      fontSize: 12,
      letterSpacing: -0.1,
    },
    chipInactive: {
      backgroundColor: inactiveChipBg,
      borderColor: inactiveChipBorder,
    },
    chipActive: {
      backgroundColor: activeChipBg,
      borderColor: activeChipBorder,
    },
    chipText: {
      fontSize: 12,
      letterSpacing: -0.1,
    },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 2,
    },
    priceInputWrapper: {
      flex: 1,
      height: 44,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: inputBg,
      borderWidth: 1,
      borderColor: inputBorder,
      borderRadius: radii.xl,
      paddingHorizontal: 12,
    },
    priceInputWrapperFocused: {
      borderColor: theme.purple,
    },
    priceInputPrefix: {
      fontSize: 14,
      fontFamily: type.family.sansBold,
      color: theme.mute,
      marginRight: 6,
    },
    priceInput: {
      flex: 1,
      fontSize: 14,
      color: theme.ink,
      fontFamily: type.family.sansMedium,
      padding: 0,
      outlineStyle: 'none',
      outlineWidth: 0,
    } as any,
    inputClearButton: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: isDark
        ? 'rgba(255, 255, 255, 0.08)'
        : 'rgba(0, 0, 0, 0.06)',
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 4,
    },
    priceDivider: {
      fontSize: 13,
      fontFamily: type.family.sansMedium,
      color: theme.muteSoft,
    },
    priceWarningRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingTop: 2,
    },
    priceWarningText: {
      fontSize: 11.5,
      fontFamily: type.family.sansMedium,
      color: isDark ? '#C4B5FD' : theme.purple,
    },
  });
}
