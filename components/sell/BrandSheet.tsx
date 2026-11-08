import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  Modal,
  Platform,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, TextInput } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { radii, type as typography } from '@/lib/theme';
import {
  TAXONOMY_BRANDS,
  NO_BRAND,
  UNBRANDED_LOCAL_TAILOR,
  type TaxonomyBrand,
} from '@/lib/taxonomy';

const DISPLAY_BOLD = typography.family.sansBold;

// Curated Popular Brands visible when search is empty (matching Vinted Reference Image 2)
const POPULAR_BRANDS = [
  'Prada',
  'Michael Kors',
  'Marco Tozzi',
  'Anna Field',
  'Pull & Bear',
  'Gémo',
  'Rylko',
  'Ralph Lauren',
  'Sebago',
  'TU',
  'Zara',
  'Nike',
  'Adidas',
  'H&M',
  "Levi's",
  'The North Face',
  'French Connection',
  'FatFace',
  'FCUK',
  'Card Factory',
  'Liverpool Football Club',
  'FC Barcelona',
  'Face',
  "Angel's Face",
  'Max Factor',
  'Bershka',
  'Mango',
  'Stradivarius',
  'ASOS',
  'Topshop',
  'New Look',
  'River Island',
  'Primark',
  'Urban Outfitters',
  'Brandy Melville',
  'Tommy Hilfiger',
  'Calvin Klein',
  'Gap',
  'Uniqlo',
  'Gucci',
  'Louis Vuitton',
  'Chanel',
  'Dior',
  'Coach',
  'Khaadi',
  'Sapphire',
  'Sana Safinaz',
  'Maria B',
  'Gul Ahmed',
  'Limelight',
  'Outfitters',
  'Bata',
  'Servis',
  'Borjan',
  'Stylo',
];

/**
 * Smart Brand Search (Substring, Word Initials, Acronyms, and Subsequence matching).
 * Searches the FULL brand list across all categories in the backend.
 */
function searchBrandDirectory(pool: TaxonomyBrand[], rawQuery: string): TaxonomyBrand[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];

  type Scored = { brand: TaxonomyBrand; score: number };
  const matches: Scored[] = [];
  const collapsedQ = q.replace(/(.)\1+/g, '$1'); // e.g. "fcc" -> "fc"

  for (const b of pool) {
    const name = b.name.toLowerCase();
    let score = 0;

    if (name === q) {
      score = 1000;
    } else if (name.startsWith(q)) {
      score = 800;
    } else if (name.includes(q)) {
      score = 600;
    } else {
      const words = name.split(/[\s\-_&/'.]+/).filter(Boolean);
      const initials = words.map((w) => w[0]).join('');

      // Acronym / word match
      if (initials === q || initials.startsWith(q)) {
        score = 500;
      } else if (words.some((w) => w.startsWith(q))) {
        score = 450;
      } else if (initials.includes(q)) {
        score = 400;
      } else {
        // Subsequence match: all characters of q appear in order in brand name
        let qIdx = 0;
        for (let i = 0; i < name.length && qIdx < q.length; i++) {
          if (name[i] === q[qIdx]) qIdx++;
        }
        if (qIdx === q.length) {
          score = 300;
        } else if (collapsedQ.length >= 2) {
          // Check collapsed query (e.g. "fc" for repeated letters like "fcc")
          if (name.includes(collapsedQ)) {
            score = 250;
          } else if (initials === collapsedQ || initials.includes(collapsedQ)) {
            score = 240;
          } else if (words.some((w) => w.startsWith(collapsedQ))) {
            score = 220;
          } else {
            let cIdx = 0;
            for (let i = 0; i < name.length && cIdx < collapsedQ.length; i++) {
              if (name[i] === collapsedQ[cIdx]) cIdx++;
            }
            if (cIdx === collapsedQ.length) {
              score = 200;
            }
          }
        }
      }
    }

    if (score > 0) {
      matches.push({ brand: b, score });
    }
  }

  // Sort by score desc, then alphabetical
  matches.sort((a, b) => b.score - a.score || a.brand.name.localeCompare(b.brand.name));
  return matches.map((m) => m.brand);
}

function BrandRow({
  name,
  isSelected,
  onSelect,
  theme,
  isDark,
}: {
  name: string;
  isSelected: boolean;
  onSelect: () => void;
  theme: any;
  isDark: boolean;
}) {
  const { theme: colors } = useTheme();
  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
        backgroundColor: pressed ? theme.surface : 'transparent',
        transform: [{ scale: pressed ? 0.985 : 1 }],
      })}
    >
      <Text
        style={{
          fontSize: 16,
          fontFamily: isSelected ? DISPLAY_BOLD : typography.family.sansMedium,
          color: theme.ink,
          flex: 1,
          paddingRight: 12,
        }}
      >
        {name}
      </Text>

      {/* Vinted-style Radio Circle */}
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: isSelected ? 2 : 1.5,
          borderColor: isSelected
            ? colors.primary
            : isDark
            ? 'rgba(255,255,255,0.25)'
            : '#D1D5DB',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {isSelected && (
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: colors.primary,
            }}
          />
        )}
      </View>
    </Pressable>
  );
}

export function BrandSheet({
  visible,
  value,
  categoryCode,
  subcategoryId,
  onSelectBrand,
  onClose,
}: {
  visible: boolean;
  value: string | null | undefined;
  categoryCode?: string;
  subcategoryId?: string | null;
  onSelectBrand: (brandName: string, isCustom?: boolean) => void;
  onClose: () => void;
}) {
  const { theme: colors } = useTheme();
  const { theme, isDark } = useTheme();
  const [query, setQuery] = useState('');
  const closedByPopStateRef = useRef(false);
  const selectingRef = useRef(false);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Prevent immediate double-tap or ghost click-through on sheet mount
  const [touchReady, setTouchReady] = useState(false);
  useEffect(() => {
    if (visible) {
      setQuery('');
      selectingRef.current = false;
      setTouchReady(false);
      const timer = setTimeout(() => setTouchReady(true), 250);
      return () => clearTimeout(timer);
    } else {
      setTouchReady(false);
    }
  }, [visible]);

  const haptic = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const handleClose = useCallback(() => {
    haptic();
    onCloseRef.current();
  }, []);

  // Hardware back button on Android
  useEffect(() => {
    if (Platform.OS !== 'android' || !visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, handleClose]);

  // Escape key & history sync on Web (strictly depends on `visible` only to avoid premature close)
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;

    closedByPopStateRef.current = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const stateId = `sell_brand_${Date.now()}`;
    try {
      window.history.pushState({ sellBrand: stateId }, '', window.location.href);
    } catch {}

    const handlePopState = () => {
      closedByPopStateRef.current = true;
      onCloseRef.current();
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handlePopState);
      if (!closedByPopStateRef.current && window.history.state?.sellBrand === stateId) {
        window.history.back();
      }
    };
  }, [visible]);

  // Popular Brands only (for initial unsearched UI)
  const popularBrandsList = useMemo(() => {
    const popularMap = new Map<string, number>();
    POPULAR_BRANDS.forEach((name, index) => {
      popularMap.set(name.toLowerCase(), index);
    });

    const populars: TaxonomyBrand[] = [];
    const seen = new Set<string>();

    for (const pName of POPULAR_BRANDS) {
      const lower = pName.toLowerCase();
      if (seen.has(lower)) continue;
      const found = TAXONOMY_BRANDS.find((b) => b.name.toLowerCase() === lower);
      if (found) {
        populars.push(found);
        seen.add(lower);
      } else {
        populars.push({
          name: pName,
          tier: 'Moderate / Mass',
          categoryRelevance: 'Clothing & Accessories',
          categoryCodes: ['CAT-01', 'CAT-02'],
        });
        seen.add(lower);
      }
    }
    return populars;
  }, []);

  // When query is non-empty, search the ENTIRE full brand list across all categories in the backend
  const filteredBrands = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return popularBrandsList;
    return searchBrandDirectory(TAXONOMY_BRANDS, trimmed);
  }, [popularBrandsList, query]);

  const trimmedQuery = query.trim();
  const hasMatchingBrand = useMemo(() => {
    if (!trimmedQuery) return false;
    const lower = trimmedQuery.toLowerCase();
    return TAXONOMY_BRANDS.some((b) => b.name.toLowerCase() === lower);
  }, [trimmedQuery]);

  const isNoBrandSelected =
    value?.toLowerCase() === 'no brand' || value === UNBRANDED_LOCAL_TAILOR;

  const handleSelect = (brandName: string, isCustom = false) => {
    if (selectingRef.current) return;
    selectingRef.current = true;
    haptic();
    onSelectBrand(brandName, isCustom);
    setQuery('');
    onCloseRef.current();
    setTimeout(() => {
      selectingRef.current = false;
    }, 400);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      transparent={false}
      onRequestClose={handleClose}
    >
      <SafeAreaView
        edges={['top', 'bottom']}
        pointerEvents={touchReady ? 'auto' : 'none'}
        style={{
          flex: 1,
          backgroundColor: theme.background,
        }}
      >
        {/* Full Page Navigation Header */}
        <View
          style={{
            height: 56,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
            backgroundColor: theme.background,
          }}
        >
          {/* Back button */}
          <Pressable
            onPress={handleClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close brand picker"
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? theme.panel : 'transparent',
              marginLeft: -6,
            })}
          >
            <Feather name="arrow-left" size={22} color={theme.ink} />
          </Pressable>

          {/* Title: Brand (matching Vinted) */}
          <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 8 }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: DISPLAY_BOLD,
                fontSize: 17,
                color: theme.ink,
                letterSpacing: -0.2,
                textAlign: 'center',
              }}
            >
              Brand
            </Text>
          </View>

          {/* Spacer to keep title centered */}
          <View style={{ width: 40 }} />
        </View>

        {/* Search Input Bar (Vinted Style) */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: radii.xl,
              backgroundColor: theme.panel,
              paddingHorizontal: 14,
              height: 44,
            }}
          >
            <Feather name="search" size={16} color={theme.mute} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search brands"
              placeholderTextColor={theme.muteSoft ?? theme.mute}
              autoCapitalize="words"
              autoCorrect={false}
              style={
                {
                  flex: 1,
                  minWidth: 0,
                  fontSize: 14.5,
                  color: theme.ink,
                  padding: 0,
                  outlineStyle: 'none',
                } as any
              }
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Feather name="x" size={16} color={theme.mute} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Scrollable Brands Directory */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          {/* Section Heading: Popular Brands (no count, per Requirement 3) */}
          {!trimmedQuery && (
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }}>
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: DISPLAY_BOLD,
                  color: theme.muteSoft,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Popular Brands
              </Text>
            </View>
          )}

          {/* Brands List */}
          {filteredBrands.map((brand) => (
            <BrandRow
              key={brand.name}
              name={brand.name}
              isSelected={value?.toLowerCase() === brand.name.toLowerCase()}
              onSelect={() => handleSelect(brand.name, false)}
              theme={theme}
              isDark={isDark}
            />
          ))}

          {/* ── WHEN QUERY IS TYPED: BRAND NOT FOUND & CREATE BRAND (Reference Image 1) ── */}
          {trimmedQuery.length > 0 && !hasMatchingBrand && (
            <View style={{ marginTop: 8 }}>
              {/* Section Header */}
              <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 }}>
                <Text
                  style={{
                    fontSize: 13,
                    color: theme.mute,
                    fontFamily: typography.family.sansMedium,
                  }}
                >
                  Brand not found
                </Text>
              </View>

              {/* Create a brand "{trimmedQuery}" row */}
              <Pressable
                onPress={() => handleSelect(trimmedQuery, true)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.border,
                  backgroundColor: pressed ? theme.surface : 'transparent',
                  transform: [{ scale: pressed ? 0.985 : 1 }],
                })}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontFamily: DISPLAY_BOLD,
                    color: theme.ink,
                    flex: 1,
                    paddingRight: 12,
                  }}
                >
                  Create a brand &ldquo;{trimmedQuery}&rdquo;
                </Text>
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: 1.5,
                    borderColor: isDark ? 'rgba(255,255,255,0.25)' : '#D1D5DB',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                />
              </Pressable>
            </View>
          )}

          {/* ── WHEN QUERY IS EMPTY: NO BRAND INDICATED (Reference Image 2) ── */}
          {!trimmedQuery && (
            <View style={{ marginTop: 8 }}>
              {/* Section Header */}
              <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 }}>
                <Text
                  style={{
                    fontSize: 13,
                    color: theme.mute,
                    fontFamily: typography.family.sansMedium,
                  }}
                >
                  No brand indicated
                </Text>
              </View>

              {/* No brand row */}
              <Pressable
                onPress={() => handleSelect(NO_BRAND, false)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.border,
                  backgroundColor: pressed ? theme.surface : 'transparent',
                  transform: [{ scale: pressed ? 0.985 : 1 }],
                })}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontFamily: isNoBrandSelected ? DISPLAY_BOLD : typography.family.sansMedium,
                    color: theme.ink,
                    flex: 1,
                    paddingRight: 12,
                  }}
                >
                  No brand
                </Text>
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: isNoBrandSelected ? 2 : 1.5,
                    borderColor: isNoBrandSelected
                      ? colors.primary
                      : isDark
                      ? 'rgba(255,255,255,0.25)'
                      : '#D1D5DB',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {isNoBrandSelected && (
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: colors.primary,
                      }}
                    />
                  )}
                </View>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
