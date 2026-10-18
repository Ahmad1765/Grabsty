// ─────────────────────────────────────────────────────────────────────────────
// SEARCH FILTER CHIPS & RESULTS HEADER (GRABSTY DESIGN SYSTEM)
// ─────────────────────────────────────────────────────────────────────────────
//
// Refinement Chips & Micro-Filters:
// 1. "Filters" with slider icon and active badge
// 2. "Category", "Brand", "Size", "Condition", "Price", "Color", "Material", "Sort by"
// 3. Subheader with formatted result count ("500+ results") and "Search results ⓘ"
// 4. Interactive quick-filter bottom sheets and search ranking modal
// ─────────────────────────────────────────────────────────────────────────────

import React, { memo, useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  Modal,
  StyleSheet,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, TextInput } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { FilterSlidersIcon } from '@/components/ui';
import { radii, type as typography, type ThemeTokens } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { CURRENCY_SYMBOL } from '@/lib/currency';
import { CATEGORIES } from '@/lib/categories';
import type { Category, Condition } from '@/types';
import type { SortKey } from '@/lib/listings';

import {
  type SearchFilterState,
  countActiveSearchFilters,
  normalizeCustomPrice,
} from '@/lib/searchFilters';


const SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'One Size'];

const CONDITIONS: { id: Condition; label: string; desc: string }[] = [
  { id: 'new_with_tags', label: 'New with tags', desc: 'Brand new, never worn with tags' },
  { id: 'like_new', label: 'Like new', desc: 'Used once or twice, perfect condition' },
  { id: 'good', label: 'Good', desc: 'Gently used, minor flaws or wear' },
  { id: 'fair', label: 'Fair', desc: 'Visible signs of wear or defects' },
];

const POPULAR_BRANDS = [
  'Nike',
  'Zara',
  'Adidas',
  'H&M',
  "Levi's",
  'Ralph Lauren',
  'Brandy Melville',
  'Stussy',
  'Vintage',
  'Carhartt',
  'Urban Outfitters',
  'North Face',
];

const COLORS: {
  name: string;
  hex: string;
  border?: string;
  gradient?: readonly [string, string, ...string[]];
}[] = [
  { name: 'Black', hex: '#111111' },
  { name: 'White', hex: '#FFFFFF', border: '#D1D5DB' },
  { name: 'Grey', hex: '#9CA3AF' },
  { name: 'Beige', hex: '#E6DCB8' },
  { name: 'Blue', hex: '#2563EB' },
  { name: 'Red', hex: '#DC2626' },
  { name: 'Green', hex: '#16A34A' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Purple', hex: '#9333EA' },
  { name: 'Yellow', hex: '#EAB308' },
  { name: 'Brown', hex: '#78350F' },
  {
    name: 'Multi',
    hex: '#A855F7',
    gradient: ['#EF4444', '#EAB308', '#3B82F6'] as const,
  },
];

const MATERIALS = [
  'Cotton',
  'Denim',
  'Leather',
  'Silk',
  'Wool',
  'Linen',
  'Polyester',
  'Knitwear',
  'Velvet',
  'Fleece',
];

const SORT_OPTIONS: { id: SortKey | 'relevance'; label: string; desc: string }[] = [
  { id: 'relevance', label: 'Relevance', desc: 'Most relevant to your search' },
  { id: 'price_asc', label: 'Price: low to high', desc: 'Cheapest items first' },
  { id: 'price_desc', label: 'Price: high to low', desc: 'Highest priced items first' },
  { id: 'newest', label: 'Newest first', desc: 'Recently added listings' },
  { id: 'popular', label: 'Most liked', desc: 'Trending and most favorited' },
];

const PRICE_PRESETS: { label: string; min: number | null; max: number | null }[] = [
  { label: 'All', min: null, max: null },
  { label: `Under ${CURRENCY_SYMBOL}25`, min: null, max: 25 },
  { label: `${CURRENCY_SYMBOL}25 - ${CURRENCY_SYMBOL}50`, min: 25, max: 50 },
  { label: `${CURRENCY_SYMBOL}50 - ${CURRENCY_SYMBOL}100`, min: 50, max: 100 },
  { label: `${CURRENCY_SYMBOL}100+`, min: 100, max: null },
];

function haptic() {
  if (Platform.OS !== 'web') {
    Haptics.selectionAsync().catch(() => {});
  }
}

type ModalType =
  | null
  | 'all'
  | 'category'
  | 'brand'
  | 'size'
  | 'condition'
  | 'price'
  | 'color'
  | 'material'
  | 'sort'
  | 'info';

export interface SearchFilterChipsProps {
  filters: SearchFilterState;
  onUpdateFilter: (updater: (prev: SearchFilterState) => SearchFilterState) => void;
  resultCount: number;
  onOpenFullFilter?: () => void;
}

export const SearchFilterChips = memo(function SearchFilterChips({
  filters,
  onUpdateFilter,
  resultCount,
  onOpenFullFilter,
}: SearchFilterChipsProps) {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);

  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [prevModal, setPrevModal] = useState<ModalType>(null);
  const [brandInput, setBrandInput] = useState('');
  const [customMin, setCustomMin] = useState(() =>
    filters.priceMin != null ? String(filters.priceMin) : '',
  );
  const [customMax, setCustomMax] = useState(() =>
    filters.priceMax != null ? String(filters.priceMax) : '',
  );

  useEffect(() => {
    if (activeModal === 'price') {
      setCustomMin(filters.priceMin != null ? String(filters.priceMin) : '');
      setCustomMax(filters.priceMax != null ? String(filters.priceMax) : '');
    }
  }, [activeModal, filters.priceMin, filters.priceMax]);

  const activeCount = useMemo(() => countActiveSearchFilters(filters), [filters]);
  const activeIconColor = isDark ? '#FFFFFF' : theme.ink;

  // Formatted count label: "500+ results" or "X results"
  const formattedCountText = useMemo(() => {
    if (resultCount >= 500) return '500+ results';
    if (resultCount === 1) return '1 result';
    return `${resultCount} results`;
  }, [resultCount]);

  // Open sub-modal from all filters modal
  const openSubModal = useCallback((modal: ModalType) => {
    setPrevModal(activeModal);
    setActiveModal(modal);
  }, [activeModal]);

  // Back or close from sub-modal
  const handleSubModalClose = useCallback(() => {
    if (prevModal) {
      setActiveModal(prevModal);
      setPrevModal(null);
    } else {
      setActiveModal(null);
    }
  }, [prevModal]);

  // Close modals completely
  const closeModal = useCallback(() => {
    setActiveModal(null);
    setPrevModal(null);
  }, []);

  // Category Toggle
  const handleSelectCategory = useCallback(
    (catId: Category | null) => {
      haptic();
      onUpdateFilter((prev) => ({
        ...prev,
        category: prev.category === catId ? null : catId,
        subcategory: null,
      }));
      handleSubModalClose();
    },
    [onUpdateFilter, handleSubModalClose],
  );

  // Brand Toggle / Set
  const handleSelectBrand = useCallback(
    (brandName: string | null) => {
      haptic();
      onUpdateFilter((prev) => ({
        ...prev,
        brand: prev.brand?.toLowerCase() === brandName?.toLowerCase() ? null : brandName,
      }));
      handleSubModalClose();
    },
    [onUpdateFilter, handleSubModalClose],
  );

  const handleApplyCustomBrand = useCallback(() => {
    const trimmed = brandInput.trim();
    if (trimmed) {
      handleSelectBrand(trimmed);
      setBrandInput('');
    }
  }, [brandInput, handleSelectBrand]);

  // Size Multi-toggle
  const handleToggleSize = useCallback(
    (size: string) => {
      haptic();
      onUpdateFilter((prev) => {
        const exists = prev.sizes.includes(size);
        return {
          ...prev,
          sizes: exists ? prev.sizes.filter((s) => s !== size) : [...prev.sizes, size],
        };
      });
    },
    [onUpdateFilter],
  );

  // Condition Multi-toggle
  const handleToggleCondition = useCallback(
    (cond: Condition) => {
      haptic();
      onUpdateFilter((prev) => {
        const exists = prev.conditions.includes(cond);
        return {
          ...prev,
          conditions: exists ? prev.conditions.filter((c) => c !== cond) : [...prev.conditions, cond],
        };
      });
    },
    [onUpdateFilter],
  );

  // Price presets & custom
  const handleSelectPricePreset = useCallback(
    (min: number | null, max: number | null) => {
      haptic();
      onUpdateFilter((prev) => ({
        ...prev,
        priceMin: min,
        priceMax: max,
      }));
      handleSubModalClose();
    },
    [onUpdateFilter, handleSubModalClose],
  );

  const handleApplyCustomPrice = useCallback(() => {
    haptic();
    const { priceMin, priceMax } = normalizeCustomPrice(customMin, customMax);
    onUpdateFilter((prev) => ({
      ...prev,
      priceMin,
      priceMax,
    }));
    handleSubModalClose();
  }, [customMin, customMax, onUpdateFilter, handleSubModalClose]);

  // Color Toggle
  const handleSelectColor = useCallback(
    (colorName: string) => {
      haptic();
      onUpdateFilter((prev) => ({
        ...prev,
        color: prev.color === colorName ? null : colorName,
      }));
      handleSubModalClose();
    },
    [onUpdateFilter, handleSubModalClose],
  );

  // Material Toggle
  const handleSelectMaterial = useCallback(
    (mat: string) => {
      haptic();
      onUpdateFilter((prev) => ({
        ...prev,
        material: prev.material === mat ? null : mat,
      }));
      handleSubModalClose();
    },
    [onUpdateFilter, handleSubModalClose],
  );

  // Sort Toggle
  const handleSelectSort = useCallback(
    (sortId: SortKey | 'relevance') => {
      haptic();
      onUpdateFilter((prev) => ({
        ...prev,
        sort: sortId === 'relevance' ? null : sortId,
      }));
      handleSubModalClose();
    },
    [onUpdateFilter, handleSubModalClose],
  );

  // Active labels on chips
  const categoryLabel = useMemo(() => {
    if (!filters.category) return 'Category';
    const found = CATEGORIES.find((c) => c.id === filters.category);
    return found ? found.label : 'Category';
  }, [filters.category]);

  const brandLabel = useMemo(() => {
    return filters.brand ? filters.brand : 'Brand';
  }, [filters.brand]);

  const sizeLabel = useMemo(() => {
    if (filters.sizes.length === 0) return 'Size';
    if (filters.sizes.length === 1) return `Size: ${filters.sizes[0]}`;
    return `Size (${filters.sizes.length})`;
  }, [filters.sizes]);

  const conditionLabel = useMemo(() => {
    if (filters.conditions.length === 0) return 'Condition';
    if (filters.conditions.length === 1) {
      const c = CONDITIONS.find((item) => item.id === filters.conditions[0]);
      return c ? c.label : 'Condition';
    }
    return `Condition (${filters.conditions.length})`;
  }, [filters.conditions]);

  const priceLabel = useMemo(() => {
    if (filters.priceMin != null && filters.priceMax != null) {
      return `${CURRENCY_SYMBOL}${filters.priceMin} - ${CURRENCY_SYMBOL}${filters.priceMax}`;
    }
    if (filters.priceMin != null) return `From ${CURRENCY_SYMBOL}${filters.priceMin}`;
    if (filters.priceMax != null) return `Up to ${CURRENCY_SYMBOL}${filters.priceMax}`;
    return 'Price';
  }, [filters.priceMin, filters.priceMax]);

  const colorLabel = useMemo(() => {
    return filters.color ? `Color: ${filters.color}` : 'Color';
  }, [filters.color]);

  const materialLabel = useMemo(() => {
    return filters.material ? `Material: ${filters.material}` : 'Material';
  }, [filters.material]);

  const sortLabel = useMemo(() => {
    if (!filters.sort) return 'Sort by';
    const s = SORT_OPTIONS.find((item) => item.id === filters.sort);
    return s ? s.label : 'Sort by';
  }, [filters.sort]);

  return (
    <View style={styles.container}>
      {/* ── 1. Horizontal Filter Chips ScrollBar ───────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.chipsScrollContent}
        style={styles.chipsScrollView}
      >

        {/* Chip 2: Category */}
        <Pressable
          onPress={() => {
            haptic();
            setActiveModal('category');
          }}
          style={({ pressed }) => [
            styles.chip,
            filters.category ? styles.chipActive : styles.chipInactive,
            { transform: [{ scale: pressed ? 0.96 : 1 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Filter by category. Currently ${categoryLabel}`}
        >
          <Text
            style={[
              styles.chipText,
              filters.category ? styles.chipTextActive : styles.chipTextInactive,
            ]}
          >
            {categoryLabel}
          </Text>
          <Feather
            name="chevron-down"
            size={12.5}
            color={filters.category ? activeIconColor : theme.mute}
            style={{ marginLeft: 4 }}
          />
        </Pressable>

        {/* Chip 3: Brand */}
        <Pressable
          onPress={() => {
            haptic();
            setActiveModal('brand');
          }}
          style={({ pressed }) => [
            styles.chip,
            filters.brand ? styles.chipActive : styles.chipInactive,
            { transform: [{ scale: pressed ? 0.96 : 1 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Filter by brand. Currently ${brandLabel}`}
        >
          <Text
            style={[
              styles.chipText,
              filters.brand ? styles.chipTextActive : styles.chipTextInactive,
            ]}
          >
            {brandLabel}
          </Text>
          <Feather
            name="chevron-down"
            size={12.5}
            color={filters.brand ? activeIconColor : theme.mute}
            style={{ marginLeft: 4 }}
          />
        </Pressable>

        {/* Chip 4: Size */}
        <Pressable
          onPress={() => {
            haptic();
            setActiveModal('size');
          }}
          style={({ pressed }) => [
            styles.chip,
            filters.sizes.length > 0 ? styles.chipActive : styles.chipInactive,
            { transform: [{ scale: pressed ? 0.96 : 1 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Filter by size. Currently ${sizeLabel}`}
        >
          <Text
            style={[
              styles.chipText,
              filters.sizes.length > 0 ? styles.chipTextActive : styles.chipTextInactive,
            ]}
          >
            {sizeLabel}
          </Text>
          <Feather
            name="chevron-down"
            size={12.5}
            color={filters.sizes.length > 0 ? activeIconColor : theme.mute}
            style={{ marginLeft: 4 }}
          />
        </Pressable>

        {/* Chip 5: Condition */}
        <Pressable
          onPress={() => {
            haptic();
            setActiveModal('condition');
          }}
          style={({ pressed }) => [
            styles.chip,
            filters.conditions.length > 0 ? styles.chipActive : styles.chipInactive,
            { transform: [{ scale: pressed ? 0.96 : 1 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Filter by condition. Currently ${conditionLabel}`}
        >
          <Text
            style={[
              styles.chipText,
              filters.conditions.length > 0 ? styles.chipTextActive : styles.chipTextInactive,
            ]}
          >
            {conditionLabel}
          </Text>
          <Feather
            name="chevron-down"
            size={12.5}
            color={filters.conditions.length > 0 ? activeIconColor : theme.mute}
            style={{ marginLeft: 4 }}
          />
        </Pressable>

        {/* Chip 6: Price */}
        <Pressable
          onPress={() => {
            haptic();
            setActiveModal('price');
          }}
          style={({ pressed }) => [
            styles.chip,
            filters.priceMin != null || filters.priceMax != null
              ? styles.chipActive
              : styles.chipInactive,
            { transform: [{ scale: pressed ? 0.96 : 1 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Filter by price. Currently ${priceLabel}`}
        >
          <Text
            style={[
              styles.chipText,
              filters.priceMin != null || filters.priceMax != null
                ? styles.chipTextActive
                : styles.chipTextInactive,
            ]}
          >
            {priceLabel}
          </Text>
          <Feather
            name="chevron-down"
            size={12.5}
            color={filters.priceMin != null || filters.priceMax != null ? activeIconColor : theme.mute}
            style={{ marginLeft: 4 }}
          />
        </Pressable>

        {/* Chip 7: Color */}
        <Pressable
          onPress={() => {
            haptic();
            setActiveModal('color');
          }}
          style={({ pressed }) => [
            styles.chip,
            filters.color ? styles.chipActive : styles.chipInactive,
            { transform: [{ scale: pressed ? 0.96 : 1 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Filter by color. Currently ${colorLabel}`}
        >
          <Text
            style={[
              styles.chipText,
              filters.color ? styles.chipTextActive : styles.chipTextInactive,
            ]}
          >
            {colorLabel}
          </Text>
          <Feather
            name="chevron-down"
            size={12.5}
            color={filters.color ? activeIconColor : theme.mute}
            style={{ marginLeft: 4 }}
          />
        </Pressable>


        {/* Chip 9: Sort by */}
        <Pressable
          onPress={() => {
            haptic();
            setActiveModal('sort');
          }}
          style={({ pressed }) => [
            styles.chip,
            filters.sort
              ? styles.chipActive
              : styles.chipInactive,
            { transform: [{ scale: pressed ? 0.96 : 1 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Sort results. Currently ${sortLabel}`}
        >
          <Text
            style={[
              styles.chipText,
              filters.sort
                ? styles.chipTextActive
                : styles.chipTextInactive,
            ]}
          >
            {sortLabel}
          </Text>
          <Feather
            name="chevron-down"
            size={12.5}
            color={filters.sort ? activeIconColor : theme.mute}
            style={{ marginLeft: 4 }}
          />
        </Pressable>
      </ScrollView>

      {/* ── 2. Results Count & Search Results ⓘ Header ──────────────────────── */}
      <View style={styles.resultsHeaderRow}>
        <Text style={styles.resultsCountText}>{formattedCountText}</Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {activeCount > 0 && (
            <Pressable
              onPress={() => {
                haptic();
                onUpdateFilter(() => ({
                  category: null,
                  subcategory: null,
                  brand: null,
                  sizes: [],
                  conditions: [],
                  priceMin: null,
                  priceMax: null,
                  color: null,
                  material: null,
                  sort: null,
                }));
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Reset all filters"
              style={({ pressed }) => ({
                opacity: pressed ? 0.6 : 1,
                outlineStyle: 'none',
              } as any)}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: typography.family.sansBold,
                  color: theme.ink,
                  textDecorationLine: 'underline',
                }}
              >
                Clear all
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => {
              haptic();
              setActiveModal('info');
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="How search results work"
            style={({ pressed }) => [
              styles.infoButton,
              { opacity: pressed ? 0.65 : 1, outlineStyle: 'none' } as any,
            ]}
          >
            <Text style={styles.infoButtonText}>Search results</Text>
            <Feather name="help-circle" size={13.5} color={theme.mute} style={{ marginLeft: 4 }} />
          </Pressable>
        </View>
      </View>

      {/* ── 3. Quick Sub-Modals / Bottom Sheets ────────────────────────────── */}

      {/* All Filters Modal */}
      <Modal
        visible={activeModal === 'all'}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeModal}>
          <Pressable style={[styles.modalCard, { maxHeight: '90%' }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <FilterSlidersIcon size={16} color={theme.text} />
                <Text style={styles.modalTitle}>Filters</Text>
                {activeCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{activeCount}</Text>
                  </View>
                )}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {activeCount > 0 && (
                  <Pressable
                    onPress={() => {
                      haptic();
                      onUpdateFilter(() => ({
                        category: null,
                        subcategory: null,
                        brand: null,
                        sizes: [],
                        conditions: [],
                        priceMin: null,
                        priceMax: null,
                        color: null,
                        material: null,
                        sort: null,
                      }));
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Reset all filters"
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontFamily: typography.family.sansBold,
                        color: theme.ink,
                        textDecorationLine: 'underline',
                      }}
                    >
                      Clear all
                    </Text>
                  </Pressable>
                )}
                <Pressable hitSlop={10} onPress={closeModal} style={styles.modalCloseBtn} accessibilityLabel="Close filters modal">
                  <Feather name="x" size={18} color={theme.text} />
                </Pressable>
              </View>
            </View>

            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
              {/* Row 1: Sort by */}
              <Pressable
                onPress={() => openSubModal('sort')}
                style={({ pressed }) => [
                  styles.filterSummaryRow,
                  filters.sort ? styles.filterSummaryRowActive : null,
                  { opacity: pressed ? 0.75 : 1 },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <Feather name="bar-chart-2" size={16} color={filters.sort ? theme.purple : theme.mute} />
                  <Text style={[styles.filterSummaryLabel, filters.sort ? styles.filterSummaryLabelActive : null]}>
                    Sort by
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.filterSummaryValue, filters.sort ? styles.filterSummaryValueActive : null]}>
                    {sortLabel}
                  </Text>
                  <Feather name="chevron-right" size={15} color={theme.mute} />
                </View>
              </Pressable>

              {/* Row 2: Category */}
              <Pressable
                onPress={() => openSubModal('category')}
                style={({ pressed }) => [
                  styles.filterSummaryRow,
                  filters.category ? styles.filterSummaryRowActive : null,
                  { opacity: pressed ? 0.75 : 1 },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <Feather name="layers" size={16} color={filters.category ? theme.purple : theme.mute} />
                  <Text style={[styles.filterSummaryLabel, filters.category ? styles.filterSummaryLabelActive : null]}>
                    Category
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.filterSummaryValue, filters.category ? styles.filterSummaryValueActive : null]}>
                    {categoryLabel}
                  </Text>
                  <Feather name="chevron-right" size={15} color={theme.mute} />
                </View>
              </Pressable>

              {/* Row 3: Brand */}
              <Pressable
                onPress={() => openSubModal('brand')}
                style={({ pressed }) => [
                  styles.filterSummaryRow,
                  filters.brand ? styles.filterSummaryRowActive : null,
                  { opacity: pressed ? 0.75 : 1 },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <Feather name="tag" size={16} color={filters.brand ? theme.purple : theme.mute} />
                  <Text style={[styles.filterSummaryLabel, filters.brand ? styles.filterSummaryLabelActive : null]}>
                    Brand
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.filterSummaryValue, filters.brand ? styles.filterSummaryValueActive : null]}>
                    {brandLabel}
                  </Text>
                  <Feather name="chevron-right" size={15} color={theme.mute} />
                </View>
              </Pressable>

              {/* Row 4: Size */}
              <Pressable
                onPress={() => openSubModal('size')}
                style={({ pressed }) => [
                  styles.filterSummaryRow,
                  filters.sizes.length > 0 ? styles.filterSummaryRowActive : null,
                  { opacity: pressed ? 0.75 : 1 },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <Feather name="maximize-2" size={16} color={filters.sizes.length > 0 ? theme.purple : theme.mute} />
                  <Text style={[styles.filterSummaryLabel, filters.sizes.length > 0 ? styles.filterSummaryLabelActive : null]}>
                    Size
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.filterSummaryValue, filters.sizes.length > 0 ? styles.filterSummaryValueActive : null]}>
                    {sizeLabel}
                  </Text>
                  <Feather name="chevron-right" size={15} color={theme.mute} />
                </View>
              </Pressable>

              {/* Row 5: Condition */}
              <Pressable
                onPress={() => openSubModal('condition')}
                style={({ pressed }) => [
                  styles.filterSummaryRow,
                  filters.conditions.length > 0 ? styles.filterSummaryRowActive : null,
                  { opacity: pressed ? 0.75 : 1 },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <Feather name="check-circle" size={16} color={filters.conditions.length > 0 ? theme.purple : theme.mute} />
                  <Text style={[styles.filterSummaryLabel, filters.conditions.length > 0 ? styles.filterSummaryLabelActive : null]}>
                    Condition
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.filterSummaryValue, filters.conditions.length > 0 ? styles.filterSummaryValueActive : null]}>
                    {conditionLabel}
                  </Text>
                  <Feather name="chevron-right" size={15} color={theme.mute} />
                </View>
              </Pressable>

              {/* Row 6: Price */}
              <Pressable
                onPress={() => openSubModal('price')}
                style={({ pressed }) => [
                  styles.filterSummaryRow,
                  filters.priceMin != null || filters.priceMax != null ? styles.filterSummaryRowActive : null,
                  { opacity: pressed ? 0.75 : 1 },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <Feather name="tag" size={16} color={filters.priceMin != null || filters.priceMax != null ? theme.purple : theme.mute} />
                  <Text style={[styles.filterSummaryLabel, filters.priceMin != null || filters.priceMax != null ? styles.filterSummaryLabelActive : null]}>
                    Price
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.filterSummaryValue, filters.priceMin != null || filters.priceMax != null ? styles.filterSummaryValueActive : null]}>
                    {priceLabel}
                  </Text>
                  <Feather name="chevron-right" size={15} color={theme.mute} />
                </View>
              </Pressable>

              {/* Row 7: Color */}
              <Pressable
                onPress={() => openSubModal('color')}
                style={({ pressed }) => [
                  styles.filterSummaryRow,
                  filters.color ? styles.filterSummaryRowActive : null,
                  { opacity: pressed ? 0.75 : 1 },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <Feather name="disc" size={16} color={filters.color ? theme.purple : theme.mute} />
                  <Text style={[styles.filterSummaryLabel, filters.color ? styles.filterSummaryLabelActive : null]}>
                    Color
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.filterSummaryValue, filters.color ? styles.filterSummaryValueActive : null]}>
                    {colorLabel}
                  </Text>
                  <Feather name="chevron-right" size={15} color={theme.mute} />
                </View>
              </Pressable>

              {/* Row 8: Material */}
              <Pressable
                onPress={() => openSubModal('material')}
                style={({ pressed }) => [
                  styles.filterSummaryRow,
                  filters.material ? styles.filterSummaryRowActive : null,
                  { opacity: pressed ? 0.75 : 1 },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <Feather name="feather" size={16} color={filters.material ? theme.purple : theme.mute} />
                  <Text style={[styles.filterSummaryLabel, filters.material ? styles.filterSummaryLabelActive : null]}>
                    Material
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.filterSummaryValue, filters.material ? styles.filterSummaryValueActive : null]}>
                    {materialLabel}
                  </Text>
                  <Feather name="chevron-right" size={15} color={theme.mute} />
                </View>
              </Pressable>
            </ScrollView>

            {/* Bottom Apply CTA Button */}
            <Pressable
              onPress={() => {
                haptic();
                closeModal();
              }}
              style={({ pressed }) => ({
                marginTop: 14,
                height: 46,
                borderRadius: radii.pill,
                backgroundColor: theme.purple,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.88 : 1,
              })}
            >
              <Text style={{ fontSize: 14.5, fontFamily: typography.family.sansBold, color: '#FFFFFF' }}>
                {resultCount > 0 ? `Show ${formattedCountText}` : 'Apply filters'}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Category Modal */}
      <Modal
        visible={activeModal === 'category'}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeModal}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {prevModal && (
                  <Pressable hitSlop={8} onPress={handleSubModalClose} style={styles.modalCloseBtn} accessibilityLabel="Back to all filters">
                    <Feather name="chevron-left" size={18} color={theme.text} />
                  </Pressable>
                )}
                <Text style={styles.modalTitle}>Category</Text>
              </View>
              <Pressable hitSlop={10} onPress={closeModal} style={styles.modalCloseBtn} accessibilityLabel="Close category modal">
                <Feather name="x" size={18} color={theme.text} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              <Pressable
                onPress={() => handleSelectCategory(null)}
                style={[
                  styles.optionRow,
                  filters.category === null && styles.optionRowSelected,
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    filters.category === null && styles.optionTextSelected,
                  ]}
                >
                  All categories
                </Text>
                {filters.category === null && (
                  <Feather name="check" size={16} color={theme.purple} />
                )}
              </Pressable>

              {CATEGORIES.map((c) => {
                const isSelected = filters.category === c.id;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => handleSelectCategory(c.id)}
                    style={[
                      styles.optionRow,
                      isSelected && styles.optionRowSelected,
                    ]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Feather name={c.icon} size={16} color={isSelected ? theme.purple : theme.mute} />
                      <Text
                        style={[
                          styles.optionText,
                          isSelected && styles.optionTextSelected,
                        ]}
                      >
                        {c.label}
                      </Text>
                    </View>
                    {isSelected && <Feather name="check" size={16} color={theme.purple} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Brand Modal */}
      <Modal
        visible={activeModal === 'brand'}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeModal}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {prevModal && (
                  <Pressable hitSlop={8} onPress={handleSubModalClose} style={styles.modalCloseBtn} accessibilityLabel="Back to all filters">
                    <Feather name="chevron-left" size={18} color={theme.text} />
                  </Pressable>
                )}
                <Text style={styles.modalTitle}>Brand</Text>
              </View>
              <Pressable hitSlop={10} onPress={closeModal} style={styles.modalCloseBtn} accessibilityLabel="Close brand modal">
                <Feather name="x" size={18} color={theme.text} />
              </Pressable>
            </View>

            {/* Custom Brand Input */}
            <View style={styles.brandInputRow}>
              <View style={styles.brandInputBox}>
                <Feather name="search" size={15} color={theme.mute} style={{ marginRight: 8 }} />
                <TextInput
                  value={brandInput}
                  onChangeText={setBrandInput}
                  placeholder="Type a brand name…"
                  placeholderTextColor={theme.mute}
                  onSubmitEditing={handleApplyCustomBrand}
                  style={styles.brandTextInput as any}
                />
                {brandInput.length > 0 && (
                  <Pressable onPress={() => setBrandInput('')} hitSlop={6}>
                    <Feather name="x" size={14} color={theme.mute} />
                  </Pressable>
                )}
              </View>
              <Pressable
                onPress={handleApplyCustomBrand}
                style={({ pressed }) => [
                  styles.brandApplyBtn,
                  { opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] },
                ]}
              >
                <Text style={styles.brandApplyBtnText}>Apply</Text>
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {filters.brand && (
                <Pressable
                  onPress={() => handleSelectBrand(null)}
                  style={styles.optionRow}
                >
                  <Text style={[styles.optionText, { color: '#EF4444' }]}>
                    Clear brand ({filters.brand})
                  </Text>
                  <Feather name="x" size={15} color="#EF4444" />
                </Pressable>
              )}

              {POPULAR_BRANDS.map((b) => {
                const isSelected = filters.brand?.toLowerCase() === b.toLowerCase();
                return (
                  <Pressable
                    key={b}
                    onPress={() => handleSelectBrand(b)}
                    style={[
                      styles.optionRow,
                      isSelected && styles.optionRowSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        isSelected && styles.optionTextSelected,
                      ]}
                    >
                      {b}
                    </Text>
                    {isSelected && <Feather name="check" size={16} color={theme.purple} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Size Modal */}
      <Modal
        visible={activeModal === 'size'}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeModal}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {prevModal && (
                  <Pressable hitSlop={8} onPress={handleSubModalClose} style={styles.modalCloseBtn} accessibilityLabel="Back to all filters">
                    <Feather name="chevron-left" size={18} color={theme.text} />
                  </Pressable>
                )}
                <Text style={styles.modalTitle}>Size</Text>
              </View>
              <Pressable hitSlop={10} onPress={closeModal} style={styles.modalCloseBtn} accessibilityLabel="Close size modal">
                <Feather name="x" size={18} color={theme.text} />
              </Pressable>
            </View>

            <View style={styles.wrapGrid}>
              {SIZES.map((sz) => {
                const isSelected = filters.sizes.includes(sz);
                return (
                  <Pressable
                    key={sz}
                    onPress={() => handleToggleSize(sz)}
                    style={[
                      styles.sizeChip,
                      isSelected ? styles.sizeChipActive : styles.sizeChipInactive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.sizeChipText,
                        isSelected ? styles.sizeChipTextActive : styles.sizeChipTextInactive,
                      ]}
                    >
                      {sz}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.modalFooterRow}>
              <Pressable
                onPress={() => {
                  onUpdateFilter((prev) => ({ ...prev, sizes: [] }));
                }}
                style={styles.modalClearBtn}
              >
                <Text style={styles.modalClearBtnText}>Clear</Text>
              </Pressable>
              <Pressable onPress={handleSubModalClose} style={styles.modalDoneBtn}>
                <Text style={styles.modalDoneBtnText}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Condition Modal */}
      <Modal
        visible={activeModal === 'condition'}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeModal}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {prevModal && (
                  <Pressable hitSlop={8} onPress={handleSubModalClose} style={styles.modalCloseBtn} accessibilityLabel="Back to all filters">
                    <Feather name="chevron-left" size={18} color={theme.text} />
                  </Pressable>
                )}
                <Text style={styles.modalTitle}>Condition</Text>
              </View>
              <Pressable hitSlop={10} onPress={closeModal} style={styles.modalCloseBtn} accessibilityLabel="Close condition modal">
                <Feather name="x" size={18} color={theme.text} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {CONDITIONS.map((cond) => {
                const isSelected = filters.conditions.includes(cond.id);
                return (
                  <Pressable
                    key={cond.id}
                    onPress={() => handleToggleCondition(cond.id)}
                    style={[
                      styles.optionRowWithDesc,
                      isSelected && styles.optionRowSelected,
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.optionText,
                          isSelected && styles.optionTextSelected,
                        ]}
                      >
                        {cond.label}
                      </Text>
                      <Text style={styles.optionDesc}>{cond.desc}</Text>
                    </View>
                    <View
                      style={[
                        styles.checkbox,
                        isSelected && styles.checkboxActive,
                      ]}
                    >
                      {isSelected && <Feather name="check" size={12} color="#FFFFFF" />}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.modalFooterRow}>
              <Pressable
                onPress={() => {
                  onUpdateFilter((prev) => ({ ...prev, conditions: [] }));
                }}
                style={styles.modalClearBtn}
              >
                <Text style={styles.modalClearBtnText}>Clear</Text>
              </Pressable>
              <Pressable onPress={handleSubModalClose} style={styles.modalDoneBtn}>
                <Text style={styles.modalDoneBtnText}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Price Modal */}
      <Modal
        visible={activeModal === 'price'}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeModal}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {prevModal && (
                  <Pressable hitSlop={8} onPress={handleSubModalClose} style={styles.modalCloseBtn} accessibilityLabel="Back to all filters">
                    <Feather name="chevron-left" size={18} color={theme.text} />
                  </Pressable>
                )}
                <Text style={styles.modalTitle}>Price Range</Text>
              </View>
              <Pressable hitSlop={10} onPress={closeModal} style={styles.modalCloseBtn} accessibilityLabel="Close price modal">
                <Feather name="x" size={18} color={theme.text} />
              </Pressable>
            </View>

            {/* Quick Presets */}
            <View style={styles.pricePresetsRow}>
              {PRICE_PRESETS.map((p, idx) => {
                const isMatch =
                  filters.priceMin === p.min && filters.priceMax === p.max;
                return (
                  <Pressable
                    key={idx}
                    onPress={() => handleSelectPricePreset(p.min, p.max)}
                    style={[
                      styles.pricePresetChip,
                      isMatch && styles.pricePresetChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.pricePresetText,
                        isMatch && styles.pricePresetTextActive,
                      ]}
                    >
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Custom Min / Max */}
            <View style={styles.priceInputsContainer}>
              <View style={styles.priceInputBox}>
                <Text style={styles.pricePrefix}>{CURRENCY_SYMBOL}</Text>
                <TextInput
                  value={customMin}
                  onChangeText={setCustomMin}
                  placeholder="Min"
                  placeholderTextColor={theme.mute}
                  keyboardType="numeric"
                  style={styles.numericInput as any}
                />
              </View>

              <Text style={{ color: theme.mute, fontSize: 16 }}>–</Text>

              <View style={styles.priceInputBox}>
                <Text style={styles.pricePrefix}>{CURRENCY_SYMBOL}</Text>
                <TextInput
                  value={customMax}
                  onChangeText={setCustomMax}
                  placeholder="Max"
                  placeholderTextColor={theme.mute}
                  keyboardType="numeric"
                  style={styles.numericInput as any}
                />
              </View>
            </View>

            <View style={styles.modalFooterRow}>
              <Pressable
                onPress={() => {
                  setCustomMin('');
                  setCustomMax('');
                  handleSelectPricePreset(null, null);
                }}
                style={styles.modalClearBtn}
              >
                <Text style={styles.modalClearBtnText}>Reset</Text>
              </Pressable>
              <Pressable onPress={handleApplyCustomPrice} style={styles.modalDoneBtn}>
                <Text style={styles.modalDoneBtnText}>Apply</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Color Modal */}
      <Modal
        visible={activeModal === 'color'}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeModal}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {prevModal && (
                  <Pressable hitSlop={8} onPress={handleSubModalClose} style={styles.modalCloseBtn} accessibilityLabel="Back to all filters">
                    <Feather name="chevron-left" size={18} color={theme.text} />
                  </Pressable>
                )}
                <Text style={styles.modalTitle}>Color</Text>
              </View>
              <Pressable hitSlop={10} onPress={closeModal} style={styles.modalCloseBtn} accessibilityLabel="Close color modal">
                <Feather name="x" size={18} color={theme.text} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
              <Pressable
                onPress={() => handleSelectColor('')}
                style={[
                  styles.optionRow,
                  !filters.color && styles.optionRowSelected,
                ]}
              >
                <Text style={[styles.optionText, !filters.color && styles.optionTextSelected]}>
                  All colors
                </Text>
                {!filters.color && <Feather name="check" size={16} color={theme.purple} />}
              </Pressable>

              {COLORS.map((col) => {
                const isSelected = filters.color === col.name;
                return (
                  <Pressable
                    key={col.name}
                    onPress={() => handleSelectColor(col.name)}
                    style={[
                      styles.optionRow,
                      isSelected && styles.optionRowSelected,
                    ]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      {col.gradient ? (
                        <LinearGradient
                          colors={col.gradient}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 10,
                            borderWidth: col.border ? 1 : 0,
                            borderColor: col.border || 'transparent',
                          }}
                        />
                      ) : (
                        <View
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 10,
                            backgroundColor: col.hex,
                            borderWidth: col.border ? 1 : 0,
                            borderColor: col.border || 'transparent',
                          }}
                        />
                      )}
                      <Text
                        style={[
                          styles.optionText,
                          isSelected && styles.optionTextSelected,
                        ]}
                      >
                        {col.name}
                      </Text>
                    </View>
                    {isSelected && <Feather name="check" size={16} color={theme.purple} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Material Modal */}
      <Modal
        visible={activeModal === 'material'}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeModal}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {prevModal && (
                  <Pressable hitSlop={8} onPress={handleSubModalClose} style={styles.modalCloseBtn} accessibilityLabel="Back to all filters">
                    <Feather name="chevron-left" size={18} color={theme.text} />
                  </Pressable>
                )}
                <Text style={styles.modalTitle}>Material</Text>
              </View>
              <Pressable hitSlop={10} onPress={closeModal} style={styles.modalCloseBtn} accessibilityLabel="Close material modal">
                <Feather name="x" size={18} color={theme.text} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
              <Pressable
                onPress={() => handleSelectMaterial('')}
                style={[
                  styles.optionRow,
                  !filters.material && styles.optionRowSelected,
                ]}
              >
                <Text style={[styles.optionText, !filters.material && styles.optionTextSelected]}>
                  All materials
                </Text>
                {!filters.material && <Feather name="check" size={16} color={theme.purple} />}
              </Pressable>

              {MATERIALS.map((mat) => {
                const isSelected = filters.material === mat;
                return (
                  <Pressable
                    key={mat}
                    onPress={() => handleSelectMaterial(mat)}
                    style={[
                      styles.optionRow,
                      isSelected && styles.optionRowSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        isSelected && styles.optionTextSelected,
                      ]}
                    >
                      {mat}
                    </Text>
                    {isSelected && <Feather name="check" size={16} color={theme.purple} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Sort Modal */}
      <Modal
        visible={activeModal === 'sort'}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeModal}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {prevModal && (
                  <Pressable hitSlop={8} onPress={handleSubModalClose} style={styles.modalCloseBtn} accessibilityLabel="Back to all filters">
                    <Feather name="chevron-left" size={18} color={theme.text} />
                  </Pressable>
                )}
                <Text style={styles.modalTitle}>Sort by</Text>
              </View>
              <Pressable hitSlop={10} onPress={closeModal} style={styles.modalCloseBtn} accessibilityLabel="Close sort modal">
                <Feather name="x" size={18} color={theme.text} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
              {SORT_OPTIONS.map((opt) => {
                const isSelected =
                  opt.id === 'relevance'
                    ? filters.sort === null
                    : filters.sort === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => handleSelectSort(opt.id)}
                    style={[
                      styles.optionRowWithDesc,
                      isSelected && styles.optionRowSelected,
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.optionText,
                          isSelected && styles.optionTextSelected,
                        ]}
                      >
                        {opt.label}
                      </Text>
                      <Text style={styles.optionDesc}>{opt.desc}</Text>
                    </View>
                    {isSelected && <Feather name="check" size={16} color={theme.purple} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Info Tooltip Dialog */}
      <Modal
        visible={activeModal === 'info'}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeModal}>
          <Pressable style={[styles.modalCard, { padding: 22 }]} onPress={(e) => e.stopPropagation()}>
            <View style={{ alignItems: 'center', marginBottom: 14 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: isDark ? 'rgba(108, 71, 255, 0.2)' : '#EDE9FE',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 12,
                }}
              >
                <Feather name="info" size={22} color={theme.purple} />
              </View>
              <Text style={[styles.modalTitle, { fontSize: 18, marginBottom: 8 }]}>
                Search ranking
              </Text>
              <Text
                style={{
                  fontSize: 13.5,
                  color: theme.mute,
                  textAlign: 'center',
                  lineHeight: 20,
                }}
              >
                Listings are ordered using an algorithmic score combining query relevance,
                seller feedback, item condition, freshness, and engagement.
              </Text>
            </View>

            <Pressable onPress={closeModal} style={styles.infoGotItBtn}>
              <Text style={styles.infoGotItBtnText}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
});

// ── Styles (Grabsty theme-aware system) ──────────────────────────────────────────

function createStyles(theme: ThemeTokens, isDark: boolean) {
  return StyleSheet.create({
    container: {
      backgroundColor: theme.background,
      paddingTop: 8,
      paddingBottom: 4,
    },
    chipsScrollView: {
      maxHeight: 38,
    },
    chipsScrollContent: {
      paddingHorizontal: 16,
      gap: 8,
      alignItems: 'center',
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 30,
      paddingHorizontal: 11,
      borderRadius: radii.pill,
      borderWidth: 1,
      outlineStyle: 'none',
      ...Platform.select({
        web: {
          outline: 'none',
          userSelect: 'none',
        } as any,
      }),
    },
    filterIconChip: {
      paddingHorizontal: 8,
      minWidth: 32,
      justifyContent: 'center',
      alignItems: 'center',
    },
    chipInactive: {
      backgroundColor: isDark ? theme.panel : '#FFFFFF',
      borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 15, 15, 0.12)',
      ...Platform.select({
        web: {
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
        } as any,
        default: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.03,
          shadowRadius: 2,
          elevation: 1,
        },
      }),
    },
    chipActive: {
      backgroundColor: isDark ? (theme.selected ?? '#2C2C30') : '#F0F1F5',
      borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : '#E5E7EB',
      borderWidth: 1,
      ...Platform.select({
        web: {
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        } as any,
      }),
    },
    chipText: {
      fontSize: 12,
      fontFamily: typography.family.sansMedium,
      letterSpacing: -0.15,
      lineHeight: 14,
    },
    chipTextInactive: {
      color: theme.text,
      fontWeight: '500',
    },
    chipTextActive: {
      color: isDark ? '#FFFFFF' : theme.ink,
      fontWeight: '600',
      fontFamily: typography.family.sansBold,
    },
    badge: {
      marginLeft: 5,
      backgroundColor: isDark ? '#FFFFFF' : '#0F0F0F',
      borderRadius: radii.pill,
      minWidth: 16,
      height: 16,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: {
      color: isDark ? '#0F0F0F' : '#FFFFFF',
      fontSize: 9.5,
      fontFamily: typography.family.sansBold,
      fontWeight: '700',
      lineHeight: 11,
    },
    resultsHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 6,
    },
    resultsCountText: {
      fontSize: 13.5,
      fontFamily: typography.family.sansMedium,
      fontWeight: '500',
      color: theme.mute,
      letterSpacing: -0.1,
    },
    infoButton: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    infoButtonText: {
      fontSize: 13.5,
      fontFamily: typography.family.sansMedium,
      fontWeight: '500',
      color: theme.mute,
      letterSpacing: -0.1,
    },

    // Modal Styles
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    modalCard: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: isDark ? theme.panel : '#FFFFFF',
      borderRadius: radii.xl,
      padding: 18,
      borderWidth: isDark ? 1 : 0,
      borderColor: theme.border,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.45 : 0.15,
      shadowRadius: 24,
      elevation: 10,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      marginBottom: 10,
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: '700',
      fontFamily: typography.family.sansBold,
      color: theme.text,
    },
    modalCloseBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? theme.surface : 'rgba(0, 0, 0, 0.05)',
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: radii.md,
      marginVertical: 1,
    },
    optionRowSelected: {
      backgroundColor: isDark ? 'rgba(108, 71, 255, 0.16)' : '#F5F3FF',
    },
    optionText: {
      fontSize: 15,
      color: theme.text,
      fontWeight: '500',
      fontFamily: typography.family.sansMedium,
    },
    optionTextSelected: {
      color: theme.purple,
      fontWeight: '700',
      fontFamily: typography.family.sansBold,
    },
    optionRowWithDesc: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 11,
      paddingHorizontal: 12,
      borderRadius: radii.md,
      marginVertical: 1,
    },
    optionDesc: {
      fontSize: 12.5,
      color: theme.mute,
      marginTop: 2,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 12,
    },
    checkboxActive: {
      backgroundColor: theme.purple,
      borderColor: theme.purple,
    },
    filterSummaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 13,
      paddingHorizontal: 12,
      borderRadius: radii.md,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    },
    filterSummaryRowActive: {
      backgroundColor: isDark ? 'rgba(108, 71, 255, 0.12)' : 'rgba(108, 71, 255, 0.05)',
    },
    filterSummaryLabel: {
      fontSize: 14.5,
      fontFamily: typography.family.sansMedium,
      color: theme.text,
      fontWeight: '500',
    },
    filterSummaryLabelActive: {
      fontWeight: '700',
      fontFamily: typography.family.sansBold,
      color: theme.text,
    },
    filterSummaryValue: {
      fontSize: 13,
      fontFamily: typography.family.sans,
      color: theme.mute,
    },
    filterSummaryValueActive: {
      fontFamily: typography.family.sansBold,
      fontWeight: '700',
      color: theme.purple,
    },
    wrapGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingVertical: 10,
    },
    sizeChip: {
      height: 30,
      paddingHorizontal: 12,
      borderRadius: radii.pill,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 46,
    },
    sizeChipInactive: {
      backgroundColor: isDark ? theme.surface : '#FFFFFF',
      borderColor: theme.border,
    },
    sizeChipActive: {
      backgroundColor: isDark ? 'rgba(108, 71, 255, 0.2)' : '#EDE9FE',
      borderColor: theme.purple,
      borderWidth: 1.5,
    },
    sizeChipText: {
      fontSize: 12,
      fontWeight: '600',
    },
    sizeChipTextInactive: {
      color: theme.text,
    },
    sizeChipTextActive: {
      color: theme.purple,
    },
    modalFooterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 16,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      gap: 12,
    },
    modalClearBtn: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: radii.pill,
      backgroundColor: isDark ? theme.surface : '#F3F4F6',
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
    },
    modalClearBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.text,
    },
    modalDoneBtn: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: radii.pill,
      backgroundColor: theme.purple,
      alignItems: 'center',
    },
    modalDoneBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    brandInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    brandInputBox: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      height: 42,
      backgroundColor: isDark ? theme.surface : '#F9FAFB',
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 12,
    },
    brandTextInput: {
      flex: 1,
      fontSize: 14,
      color: theme.text,
      height: '100%',
      padding: 0,
    },
    brandApplyBtn: {
      paddingHorizontal: 16,
      height: 42,
      borderRadius: radii.md,
      backgroundColor: theme.purple,
      alignItems: 'center',
      justifyContent: 'center',
    },
    brandApplyBtnText: {
      color: '#FFFFFF',
      fontSize: 13.5,
      fontWeight: '700',
      fontFamily: typography.family.sansBold,
    },
    pricePresetsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 14,
    },
    pricePresetChip: {
      height: 30,
      paddingHorizontal: 12,
      borderRadius: radii.pill,
      backgroundColor: isDark ? theme.surface : '#F3F4F6',
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pricePresetChipActive: {
      backgroundColor: isDark ? 'rgba(108, 71, 255, 0.2)' : '#EDE9FE',
      borderWidth: 1.5,
      borderColor: theme.purple,
    },
    pricePresetText: {
      fontSize: 12,
      fontWeight: '500',
      color: theme.text,
    },
    pricePresetTextActive: {
      color: theme.purple,
      fontWeight: '700',
    },
    priceInputsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginVertical: 10,
    },
    priceInputBox: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      height: 42,
      backgroundColor: isDark ? theme.surface : '#F9FAFB',
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 10,
    },
    pricePrefix: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.mute,
      marginRight: 4,
    },
    numericInput: {
      flex: 1,
      fontSize: 14,
      color: theme.text,
      padding: 0,
      height: '100%',
    },
    infoGotItBtn: {
      paddingVertical: 12,
      borderRadius: radii.pill,
      backgroundColor: theme.purple,
      alignItems: 'center',
    },
    infoGotItBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
  });
}
