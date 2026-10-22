import React, { memo, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Keyboard,
  Platform,
  useWindowDimensions,
  BackHandler,
  Animated as RNAnimated,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
  runOnJS,
  Extrapolation,
} from 'react-native-reanimated';
import { Text, TextInput } from '@/lib/rnText';
import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useToast } from '@/lib/toast';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/lib/auth';
import { useSearchHistory } from '@/hooks/useSearchHistory';
import { supabase } from '@/lib/supabase';
import { searchUsers } from '@/lib/follows';
import { searchListings, fetchListingsResult } from '@/lib/listings';
import { getSearchSuggestions } from '@/lib/searchSuggestions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createSavedSearch, deleteSavedSearch } from '@/lib/savedSearches';
import { useSavedSearchesQuery } from '@/lib/queries/useFeedQueries';
import { queryClient } from '@/lib/queryClient';
import { qk } from '@/lib/queries/keys';
import { PreSearchSuggestions } from './PreSearchSuggestions';
import { SearchFilterChips } from '@/components/discover/SearchFilterChips';
import {
  type SearchFilterState,
  EMPTY_SEARCH_FILTERS,
  countActiveSearchFilters,
} from '@/lib/searchFilters';
import { ListingCard } from '@/components/ListingCard';
import { useGridDimensions } from '@/lib/responsive';
import { radii, type as typography } from '@/lib/theme';
import type { Category, Listing } from '@/types';
import { getOptimizedImageUrl } from '@/lib/images';

function haptic() {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

export type SearchTab = 'listings' | 'seller';

const POPULAR_SEARCHES = [
  'Vintage',
  'Sneakers',
  'Jackets',
  'Dresses',
  'Hoodies',
  'Jewelry',
  'Bags',
  'Nike',
  'Zara',
  'Denim',
  'Watches',
  'Boots',
];

export interface RecentMemberItem {
  id: string;
  username: string;
  full_name?: string;
  avatar_url?: string | null;
  followers?: string;
  listingCount?: number;
  is_verified?: boolean;
}

export interface SellerResult {
  id: string;
  username: string;
  full_name?: string;
  avatar_url?: string | null;
  listingCount: number;
  followers?: string;
}

interface HomeSearchViewProps {
  onClose: () => void;
  onOpenSavedAlerts?: () => void;
  initialQuery?: string;
  initialTab?: SearchTab;
  initialCategory?: string | null;
}

export const HomeSearchView = memo(function HomeSearchView({
  onClose,
  onOpenSavedAlerts,
  initialQuery = '',
  initialTab = 'listings',
  initialCategory,
}: HomeSearchViewProps) {
  const toast = useToast();
  const { theme, isDark } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const inputRef = useRef<any>(null);
  const pagerRef = useRef<ScrollView>(null);

  const isCategorySearch = !!initialCategory && initialCategory !== 'all';
  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<SearchTab>(initialTab);
  const [hasSubmitted, setHasSubmitted] = useState(
    initialQuery.trim().length > 0 || !!initialCategory,
  );
  const { previousSearches, historyItems, addSearch, removeSearch, clearAll } = useSearchHistory();

  const suggestions = useMemo(
    () =>
      getSearchSuggestions(query, {
        recentSearches: previousSearches,
        limit: 12,
      }),
    [query, previousSearches],
  );

  const [sellerResults, setSellerResults] = useState<SellerResult[]>([]);
  const [listingResults, setListingResults] = useState<Listing[]>([]);
  const [searchFilters, setSearchFilters] = useState<SearchFilterState>(() => ({
    ...EMPTY_SEARCH_FILTERS,
    category: isCategorySearch ? (initialCategory as Category) : null,
  }));
  const [loading, setLoading] = useState(false);

  const searchPlaceholder = useMemo(() => {
    if (searchFilters.category) {
      const cat = searchFilters.category;
      return `Search in ${cat.charAt(0).toUpperCase() + cat.slice(1)}`;
    }
    if (activeTab === 'seller') {
      return 'Search members…';
    }
    if (screenWidth < 375) {
      return 'Search items…';
    }
    if (screenWidth < 415) {
      return 'What are you looking for?';
    }
    return 'What are you looking for today?';
  }, [searchFilters.category, activeTab, screenWidth]);

  const scrollX = useRef(new RNAnimated.Value(initialTab === 'listings' ? 0 : screenWidth)).current;
  const searchRequestIdRef = useRef(0);

  const { user } = useAuth();
  const savedSearchesQ = useSavedSearchesQuery(user?.id ?? null);

  const [localSavedKeys, setLocalSavedKeys] = useState<Set<string>>(new Set());

  const storageKey = user?.id
    ? `@ceranix_saved_searches_local:${user.id}`
    : '@ceranix_saved_searches_local:guest';

  // Load local saved searches scoped to active user / guest; clear previous user keys on auth change
  useEffect(() => {
    setLocalSavedKeys(new Set());
    let isMounted = true;

    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (!isMounted) return;
        if (raw) {
          try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
              setLocalSavedKeys(new Set(arr));
            }
          } catch {}
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [storageKey]);

  const [recentlyViewedMembers, setRecentlyViewedMembers] = useState<RecentMemberItem[]>([]);
  const [hasRealRecentHistory, setHasRealRecentHistory] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadRealMembers() {
      try {
        const raw = await AsyncStorage.getItem('@ceranix_recently_viewed_members');
        let storedMembers: RecentMemberItem[] = [];
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              // Filter out any stale mock IDs
              storedMembers = parsed.filter(
                (m) => m && m.id && !m.id.startsWith('mock-') && !m.id.startsWith('u-'),
              );
            }
          } catch {}
        }

        if (storedMembers.length > 0 && isMounted) {
          setRecentlyViewedMembers(storedMembers);
          setHasRealRecentHistory(true);
          return;
        }

        // Fetch real profiles from Supabase database to display real platform members
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, followers_count, is_verified')
          .order('followers_count', { ascending: false, nullsFirst: false })
          .limit(10);

        if (!error && data && data.length > 0 && isMounted) {
          const mapped: RecentMemberItem[] = data.filter((p) => p.id !== user?.id).map((p) => ({
            id: p.id,
            username: p.username || 'user',
            full_name: p.full_name,
            avatar_url: p.avatar_url,
            followers:
              p.followers_count === 1
                ? '1 follower'
                : `${p.followers_count ?? 0} followers`,
            is_verified: p.is_verified,
          }));
          setRecentlyViewedMembers(mapped);
          setHasRealRecentHistory(false);
        }
      } catch (err) {
        console.warn('[HomeSearchView] loadRealMembers error', err);
      }
    }

    loadRealMembers();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  const [tabLayouts, setTabLayouts] = useState<{
    listings: { x: number; width: number };
    seller: { x: number; width: number };
  }>({
    listings: { x: 16, width: 44 },
    seller: { x: 84, width: 72 },
  });

  const handleSelectMember = useCallback((member: RecentMemberItem | SellerResult) => {
    const nextMember: RecentMemberItem = {
      id: member.id,
      username: member.username,
      full_name: member.full_name,
      avatar_url: member.avatar_url,
      followers: (member as any).followers || `${member.listingCount || 0} listings`,
      is_verified: (member as any).is_verified,
    };
    setRecentlyViewedMembers((prev) => {
      const filtered = prev.filter((m) => m.id !== member.id && m.username.toLowerCase() !== member.username.toLowerCase());
      const updated = [nextMember, ...filtered].slice(0, 20);
      AsyncStorage.setItem('@ceranix_recently_viewed_members', JSON.stringify(updated)).catch(() => {});
      return updated;
    });
    setHasRealRecentHistory(true);

    router.push(`/user/${member.id}` as any);
  }, []);

  const effectiveSearchInfo = useMemo(() => {
    const trimmed = query.trim();
    if (trimmed) {
      return { key: `q:${trimmed.toLowerCase()}`, label: trimmed, query: trimmed };
    }
    if (searchFilters.brand) {
      return { key: `brand:${searchFilters.brand.toLowerCase()}`, label: searchFilters.brand, query: searchFilters.brand };
    }
    if (searchFilters.category) {
      return { key: `cat:${searchFilters.category.toLowerCase()}`, label: searchFilters.category, query: searchFilters.category };
    }
    const count = countActiveSearchFilters(searchFilters);
    if (count > 0) {
      return { key: `filters:${count}`, label: `${count} Filters`, query: 'Filtered Search' };
    }
    return { key: 'all:search', label: 'All Items', query: 'All Listings' };
  }, [query, searchFilters]);

  const isSaved = useMemo(() => {
    const { key, label } = effectiveSearchInfo;
    if (localSavedKeys.has(key)) return true;
    if (savedSearchesQ.data) {
      const actualQuery = query.trim() || null;
      if (actualQuery) {
        const qNorm = actualQuery.toLowerCase();
        return savedSearchesQ.data.some(
          (s) =>
            s.query?.trim().toLowerCase() === qNorm ||
            s.label?.trim().toLowerCase() === qNorm,
        );
      }
      const catNorm = searchFilters.category?.toLowerCase() || null;
      const labelNorm = label.toLowerCase();
      return savedSearchesQ.data.some(
        (s) =>
          (!s.query || s.query.trim() === '') &&
          (catNorm ? s.category?.toLowerCase() === catNorm : !s.category) &&
          s.label?.trim().toLowerCase() === labelNorm,
      );
    }
    return false;
  }, [effectiveSearchInfo, localSavedKeys, query, savedSearchesQ.data, searchFilters.category]);

  const handleToggleSaveSearch = useCallback(async () => {
    haptic();
    const { key, label } = effectiveSearchInfo;
    const currentlySaved = isSaved;
    const nextSaved = !currentlySaved;

    // Optimistic toggle locally
    setLocalSavedKeys((prev) => {
      const next = new Set(prev);
      if (nextSaved) {
        next.add(key);
      } else {
        next.delete(key);
      }
      AsyncStorage.setItem(
        storageKey,
        JSON.stringify(Array.from(next)),
      ).catch(() => {});
      return next;
    });

    if (nextSaved) {
      toast.show(`Saved search alert for "${label}"`, {
        variant: 'success',
        icon: 'star',
      });
    } else {
      toast.show('Search alert removed', {
        variant: 'info',
        icon: 'trash-2',
      });
    }

    // If authenticated, sync with Supabase
    if (user?.id) {
      try {
        const actualQuery = query.trim() || null;
        const existing = savedSearchesQ.data?.find((s) => {
          if (actualQuery) {
            const qNorm = actualQuery.toLowerCase();
            return (
              s.query?.trim().toLowerCase() === qNorm ||
              s.label?.trim().toLowerCase() === qNorm
            );
          }
          const catNorm = searchFilters.category?.toLowerCase() || null;
          const labelNorm = label.toLowerCase();
          return (
            (!s.query || s.query.trim() === '') &&
            (catNorm ? s.category?.toLowerCase() === catNorm : !s.category) &&
            s.label?.trim().toLowerCase() === labelNorm
          );
        });

        if (currentlySaved && existing) {
          await deleteSavedSearch(existing.id);
          queryClient.invalidateQueries({ queryKey: qk.savedSearches(user.id) });
        } else if (!currentlySaved) {
          await createSavedSearch({
            userId: user.id,
            query: actualQuery,
            category: searchFilters.category || null,
            gender: null,
            label,
          });
          queryClient.invalidateQueries({ queryKey: qk.savedSearches(user.id) });
        }
      } catch (err) {
        console.warn('[saved-searches] sync error', err);
      }
    }
  }, [effectiveSearchInfo, isSaved, user, savedSearchesQ.data, query, searchFilters, toast, storageKey]);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  // ── Entrance / Exit Motion ──────────────────────────────────────────────────
  const animProgress = useSharedValue(0);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    animProgress.value = withTiming(1, {
      duration: 400,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    });
    const focusTimer = setTimeout(() => {
      inputRef.current?.focus?.();
    }, 260);
    return () => clearTimeout(focusTimer);
  }, [animProgress]);

  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    haptic();
    Keyboard.dismiss();
    const trimmed = query.trim();
    if (trimmed.length >= 2) {
      addSearch(trimmed, activeTab);
    }
    animProgress.value = withTiming(
      0,
      {
        duration: 320,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      },
      (finished) => {
        if (finished) {
          runOnJS(onClose)();
        }
      },
    );
  }, [isClosing, onClose, animProgress, query, activeTab, addSearch]);

  // Focus-scoped: this overlay stays mounted under any pushed screen (product,
  // profile), and an always-on listener returning true swallowed Back there.
  useFocusEffect(useCallback(() => {
    const onBackPress = () => {
      if (hasSubmitted) {
        setHasSubmitted(false);
        inputRef.current?.focus?.();
        setQuery('');
        setSearchFilters(EMPTY_SEARCH_FILTERS);
        ++searchRequestIdRef.current;
        setSellerResults([]);
        setListingResults([]);
        setLoading(false);
        return true;
      }
      handleClose();
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [hasSubmitted, handleClose]));

  const rootAnimatedStyle = useAnimatedStyle(() => {
    const translateX = interpolate(
      animProgress.value,
      [0, 1],
      [screenWidth, 0],
      Extrapolation.CLAMP,
    );
    return {
      transform: [{ translateX }],
    };
  });

  const searchBarAnimatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(animProgress.value, [0, 1], [0.96, 1], Extrapolation.CLAMP);
    return {
      transform: [{ scale }],
    };
  });

  const HORIZONTAL_PAD = 12;
  const GRID_GAP = 8;

  const { cardWidth } = useGridDimensions({
    min: 2,
    max: 4,
    thresholds: [560, 900, 1200],
    horizontalPadding: HORIZONTAL_PAD,
    gap: GRID_GAP,
  });

  const hasQuery = query.trim().length > 0;

  // Real-time interpolated translation and width for sliding indicator bar matching Image 1
  const indicatorTranslateX = scrollX.interpolate({
    inputRange: [0, screenWidth],
    outputRange: [tabLayouts.listings.x, tabLayouts.seller.x],
    extrapolate: 'clamp',
  });

  const indicatorWidth = scrollX.interpolate({
    inputRange: [0, screenWidth],
    outputRange: [tabLayouts.listings.width, tabLayouts.seller.width],
    extrapolate: 'clamp',
  });

  // Real-time multi-criteria filtering on listingResults
  const displayListings = useMemo(() => {
    let list = listingResults;

    if (searchFilters.category) {
      list = list.filter((l) => l && l.category === searchFilters.category);
    }
    if (searchFilters.subcategory) {
      list = list.filter((l) => l && l.subcategory === searchFilters.subcategory);
    }
    if (searchFilters.brand) {
      const bLower = searchFilters.brand.toLowerCase();
      list = list.filter((l) => l && l.brand && l.brand.toLowerCase().includes(bLower));
    }
    if (searchFilters.sizes.length > 0) {
      list = list.filter((l) => l && l.size && searchFilters.sizes.includes(l.size));
    }
    if (searchFilters.conditions.length > 0) {
      list = list.filter((l) => l && l.condition && searchFilters.conditions.includes(l.condition));
    }
    if (searchFilters.priceMin != null) {
      list = list.filter((l) => l && l.price >= searchFilters.priceMin!);
    }
    if (searchFilters.priceMax != null) {
      list = list.filter((l) => l && l.price <= searchFilters.priceMax!);
    }
    if (searchFilters.color) {
      const colLower = searchFilters.color.toLowerCase();
      list = list.filter((l) => l && l.color && l.color.toLowerCase() === colLower);
    }
    if (searchFilters.material) {
      const matLower = searchFilters.material.toLowerCase();
      list = list.filter(
        (l) =>
          l &&
          ((l.description && l.description.toLowerCase().includes(matLower)) ||
            (Array.isArray(l.tags) &&
              l.tags.some((t) => typeof t === 'string' && t.toLowerCase().includes(matLower)))),
      );
    }
    if (searchFilters.sort) {
      list = [...list];
      if (searchFilters.sort === 'price_asc') {
        list.sort((a, b) => a.price - b.price);
      } else if (searchFilters.sort === 'price_desc') {
        list.sort((a, b) => b.price - a.price);
      } else if (searchFilters.sort === 'newest') {
        list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      } else if (searchFilters.sort === 'popular') {
        list.sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
      }
    }

    return list;
  }, [listingResults, searchFilters]);

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  // Re-sync scrollX and pager offset on resize only (activeTab driven programmatically by handleTabPress)
  useEffect(() => {
    const targetX = activeTabRef.current === 'listings' ? 0 : screenWidth;
    scrollX.setValue(targetX);
    pagerRef.current?.scrollTo({ x: targetX, animated: false });
  }, [screenWidth, scrollX]);

  // ── Core Search Execution ───────────────────────────────────────────────────
  const runSearch = useCallback(
    async (searchTerm: string, categoryFilter: Category | null, requestId: number) => {
      const trimmed = searchTerm.trim();

      if (!trimmed && !categoryFilter && !hasSubmitted) {
        if (searchRequestIdRef.current === requestId) {
          setSellerResults([]);
          setListingResults([]);
          setLoading(false);
        }
        return;
      }

      if (searchRequestIdRef.current !== requestId) return;
      setLoading(true);

      try {
        let usersResult: any[] = [];
        let listingsResult: { ok: boolean; rows?: Listing[] } = { ok: false, rows: [] };

        if (trimmed) {
          [usersResult, listingsResult] = await Promise.all([
            searchUsers(trimmed, 25).catch(() => []),
            searchListings({ query: trimmed, limit: 40 }).catch(() => ({ ok: false, rows: [] })),
          ]);
        } else if (categoryFilter) {
          [usersResult, listingsResult] = await Promise.all([
            searchUsers(categoryFilter, 25).catch(() => []),
            fetchListingsResult({
              category: categoryFilter,
              limit: 60,
            }).catch(() => ({ ok: false, rows: [] })),
          ]);
        } else {
          [usersResult, listingsResult] = await Promise.all([
            searchUsers('', 25).catch(() => []),
            fetchListingsResult({
              limit: 60,
            }).catch(() => ({ ok: false, rows: [] })),
          ]);
        }

        if (searchRequestIdRef.current !== requestId) return;

        let combinedSellers: SellerResult[] = [];

        // Real profiles from Supabase (counts returned directly from server-side grouped query)
        if (usersResult && usersResult.length > 0) {
          combinedSellers = usersResult.map((u) => ({
            id: u.id,
            username: u.username ?? 'user',
            full_name: u.full_name,
            avatar_url: u.avatar_url,
            listingCount: u.listingCount ?? 0,
          }));
        }

        // Real profiles from Supabase
        if (usersResult && usersResult.length > 0) {
          combinedSellers = usersResult.map((u) => ({
            id: u.id,
            username: u.username ?? 'user',
            full_name: u.full_name,
            avatar_url: u.avatar_url,
            listingCount: u.listingCount ?? 0,
            followers:
              u.followers_count === 1
                ? '1 follower'
                : `${u.followers_count ?? 0} followers`,
          }));
        }

        // Also check if any real member in recentlyViewedMembers matches the term
        if (trimmed) {
          const lower = trimmed.toLowerCase();
          for (const m of recentlyViewedMembers) {
            if (
              (m.username.toLowerCase().includes(lower) ||
                (m.full_name && m.full_name.toLowerCase().includes(lower))) &&
              !combinedSellers.some((s) => s.id === m.id)
            ) {
              combinedSellers.push({
                id: m.id,
                username: m.username,
                full_name: m.full_name,
                avatar_url: m.avatar_url,
                listingCount: m.listingCount ?? 0,
                followers: m.followers,
              });
            }
          }
        }

        if (searchRequestIdRef.current === requestId) {
          setSellerResults(combinedSellers);

          if (listingsResult.ok && listingsResult.rows) {
            setListingResults(listingsResult.rows);
          } else {
            setListingResults([]);
          }
        }
      } catch (err) {
        if (searchRequestIdRef.current === requestId) {
          console.warn('[HomeSearchView] Search error', err);
        }
      } finally {
        if (searchRequestIdRef.current === requestId) {
          setLoading(false);
        }
      }
    },
    [hasSubmitted],
  );

  useEffect(() => {
    const trimmed = query.trim();
    // Increment searchRequestId immediately when query changes so in-flight searches immediately become stale
    const requestId = ++searchRequestIdRef.current;
    const cat = searchFilters.category;

    if (!trimmed && !cat && !hasSubmitted) {
      setSellerResults([]);
      setListingResults([]);
      setLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      runSearch(trimmed, cat, requestId);
    }, trimmed ? 150 : 0);

    return () => clearTimeout(timer);
  }, [query, searchFilters.category, hasSubmitted, runSearch]);

  // Handle Tab Switch by clicking header (preserves open keyboard)
  const handleTabPress = useCallback(
    (tab: SearchTab) => {
      haptic();
      setActiveTab(tab);
      const targetX = tab === 'listings' ? 0 : screenWidth;
      pagerRef.current?.scrollTo({ x: targetX, animated: true });
      RNAnimated.timing(scrollX, {
        toValue: targetX,
        duration: 240,
        useNativeDriver: false,
      }).start();
      inputRef.current?.focus?.();
    },
    [screenWidth, scrollX],
  );

  // Scroll handler with continuous animation event
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = e.nativeEvent?.contentOffset?.x ?? 0;
      scrollX.setValue(offsetX);
      const pageIndex = Math.round(offsetX / screenWidth);
      const newTab: SearchTab = pageIndex === 0 ? 'listings' : 'seller';
      if (newTab !== activeTab) {
        setActiveTab(newTab);
      }
    },
    [screenWidth, activeTab, scrollX],
  );

  // Handle Momentum Scroll End for Horizontal Pager (preserves open keyboard)
  const handleMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = e.nativeEvent.contentOffset.x;
      const pageIndex = Math.round(offsetX / screenWidth);
      const newTab: SearchTab = pageIndex === 0 ? 'listings' : 'seller';
      if (newTab !== activeTab) {
        setActiveTab(newTab);
        inputRef.current?.focus?.();
      }
    },
    [screenWidth, activeTab],
  );

  // Touch Swipe Handlers for responsive horizontal swipe across web and mobile
  const handleTouchStart = useCallback((e: any) => {
    touchStartX.current = e.nativeEvent?.pageX ?? e.nativeEvent?.clientX ?? 0;
    touchStartY.current = e.nativeEvent?.pageY ?? e.nativeEvent?.clientY ?? 0;
  }, []);

  const handleTouchEnd = useCallback(
    (e: any) => {
      if (hasSubmitted) return;
      const currentX = e.nativeEvent?.pageX ?? e.nativeEvent?.clientX ?? 0;
      const currentY = e.nativeEvent?.pageY ?? e.nativeEvent?.clientY ?? 0;
      const deltaX = currentX - touchStartX.current;
      const deltaY = currentY - touchStartY.current;

      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 35) {
        if (touchStartX.current < 45 && deltaX > 45 && activeTab === 'listings') {
          handleClose();
          return;
        }
        if (deltaX < 0 && activeTab === 'listings') {
          // Swipe left -> go to Seller
          handleTabPress('seller');
        } else if (deltaX > 0 && activeTab === 'seller') {
          // Swipe right -> go to Listings
          handleTabPress('listings');
        }
      }
    },
    [hasSubmitted, activeTab, handleTabPress, handleClose],
  );

  // Suggestion selection from pre-search suggestions list
  const handleSelectSuggestion = useCallback(
    (term: string) => {
      haptic();
      setQuery(term);
      addSearch(term);
      setHasSubmitted(true);
      Keyboard.dismiss();
    },
    [addSearch],
  );

  // Arrow click to populate search bar for query refinement
  const handlePopulateSuggestion = useCallback(
    (term: string) => {
      haptic();
      setQuery(term.trim() + ' ');
      setHasSubmitted(false);
      inputRef.current?.focus?.();
    },
    [],
  );

  // Tag selection from Previous searches / Popular searches with tab routing
  const handleSelectTag = useCallback(
    (term: string, targetTab?: SearchTab) => {
      haptic();
      setQuery(term);
      const tabToUse = targetTab ?? activeTab;
      addSearch(term, tabToUse);
      if (tabToUse !== activeTab) {
        handleTabPress(tabToUse);
      }
      setHasSubmitted(true);
      Keyboard.dismiss();
    },
    [activeTab, handleTabPress, addSearch],
  );

  const handleSubmitSearch = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed.length > 0) {
      addSearch(trimmed, activeTab);
      setHasSubmitted(true);
      Keyboard.dismiss();
    } else if (searchFilters.category) {
      setHasSubmitted(true);
      Keyboard.dismiss();
    }
  }, [query, activeTab, addSearch, searchFilters.category]);

  // ── Render Seller Row (Exact match to Image 2) ─────────────────────────────
  const renderSellerItem = useCallback(
    ({ item }: { item: SellerResult }) => {
      const initial = (item.username?.charAt(0) || 'D').toUpperCase();

      return (
        <Pressable
          onPress={() => {
            haptic();
            const trimmed = query.trim();
            if (trimmed.length > 0) {
              addSearch(trimmed);
            }
            handleSelectMember(item);
          }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
            backgroundColor: pressed ? theme.surface : theme.background,
          })}
        >
          {/* Avatar: Circular avatar matching Image 3 */}
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: isDark ? theme.surface : '#FEF08A',
              borderWidth: 1,
              borderColor: theme.border,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 14,
              overflow: 'hidden',
            }}
          >
            {item.avatar_url ? (
              <Image
                source={{ uri: getOptimizedImageUrl(item.avatar_url, { width: 120 }) }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
            ) : (
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: '#854D0E',
                }}
              >
                {initial.toLowerCase()}
              </Text>
            )}
          </View>

          {/* Username and Listing count */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                fontSize: 15,
                fontWeight: '600',
                color: theme.text,
                letterSpacing: -0.2,
              }}
              numberOfLines={1}
            >
              {item.username}
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: theme.mute,
                marginTop: 2,
              }}
            >
              {item.listingCount} {item.listingCount === 1 ? 'listing' : 'listings'}
            </Text>
          </View>

          <Feather name="arrow-up-right" size={21} color={isDark ? '#9CA3AF' : '#4B5563'} />
        </Pressable>
      );
    },
    [toast, theme, isDark, query, addSearch, handleSelectMember],
  );

  // ── Render Idle Landing Content for Listings Tab (Image 2) ─────────────────
  const renderListingsIdleLanding = (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 }}
    >
      {/* ── Your Recent Searches (Image 2) ────────────────────────── */}
      {historyItems.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
            }}
          >
            <Text
              style={{
                fontSize: 15.5,
                fontWeight: '700',
                fontFamily: typography.family.sansBold,
                color: isDark ? '#9CA3AF' : '#4B5563',
                letterSpacing: -0.2,
              }}
            >
              Your Recent Searches
            </Text>

            <Pressable
              onPress={() => {
                haptic();
                clearAll();
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear all recent searches"
              style={({ pressed }) => ({
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text
                style={{
                  fontSize: 14.5,
                  fontWeight: '600',
                  fontFamily: typography.family.sansBold,
                  color: theme.purple,
                }}
              >
                Clear All
              </Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {historyItems.map((item) => (
              <View
                key={item.term}
                style={{
                  height: 30,
                  backgroundColor: isDark ? theme.surface : theme.panel,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 15,
                  flexDirection: 'row',
                  alignItems: 'center',
                  overflow: 'hidden',
                }}
              >
                <Pressable
                  onPress={() => handleSelectTag(item.term, item.tab || 'listings')}
                  accessibilityRole="button"
                  accessibilityLabel={`Search for ${item.term}`}
                  style={({ pressed }) => ({
                    paddingLeft: 12,
                    paddingRight: 4,
                    height: '100%',
                    justifyContent: 'center',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text
                    style={{
                      fontSize: 12.5,
                      fontWeight: '500',
                      fontFamily: typography.family.sansMedium,
                      color: theme.text,
                    }}
                    numberOfLines={1}
                  >
                    {item.term}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    haptic();
                    removeSearch(item.term);
                  }}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.term} from recent searches`}
                  style={({ pressed }) => ({
                    paddingRight: 8,
                    paddingLeft: 2,
                    height: '100%',
                    justifyContent: 'center',
                    alignItems: 'center',
                    opacity: pressed ? 0.5 : 0.8,
                  })}
                >
                  <Feather name="x" size={13} color={isDark ? '#9CA3AF' : '#6B7280'} />
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Popular searches Section */}
      <View style={{ marginTop: 24 }}>
        <Text
          style={{
            fontSize: 15,
            fontWeight: '700',
            fontFamily: typography.family.sansBold,
            color: theme.text,
            marginBottom: 12,
          }}
        >
          Popular searches
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {POPULAR_SEARCHES.map((term) => (
            <Pressable
              key={term}
              onPress={() => handleSelectTag(term, 'listings')}
              style={({ pressed }) => ({
                height: 30,
                backgroundColor: isDark ? theme.surface : theme.panel,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 15,
                paddingHorizontal: 12,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text
                style={{
                  fontSize: 12.5,
                  fontWeight: '500',
                  fontFamily: typography.family.sansMedium,
                  color: theme.text,
                }}
              >
                {term}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );

  // ── Render Idle Landing Content for Members Tab (Real Database Members) ────
  const renderMembersIdleLanding = (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}
    >
      <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
        <Text
          style={{
            fontSize: 15,
            fontWeight: '700',
            fontFamily: typography.family.sansBold,
            color: isDark ? '#9CA3AF' : '#4B5563',
            letterSpacing: -0.1,
          }}
        >
          {hasRealRecentHistory ? 'Recently Viewed Users' : 'Suggested Members'}
        </Text>
      </View>

      {recentlyViewedMembers.map((member) => {
        const initial = (member.username || 'U').charAt(0).toUpperCase();
        return (
          <Pressable
            key={member.id}
            onPress={() => {
              haptic();
              handleSelectMember(member);
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderBottomWidth: 1,
              borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
              backgroundColor: pressed ? (isDark ? theme.surface : '#F9FAFB') : 'transparent',
            })}
          >
            {/* Circular Avatar */}
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: member.avatar_url ? 'transparent' : (isDark ? theme.surface : '#FEF08A'),
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 14,
                overflow: 'hidden',
                borderWidth: member.avatar_url ? 0 : 1,
                borderColor: theme.border,
              }}
            >
              {member.avatar_url ? (
                <Image
                  source={{ uri: getOptimizedImageUrl(member.avatar_url, { width: 120 }) }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                />
              ) : (
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: '700',
                    fontFamily: typography.family.sansBold,
                    color: '#854D0E',
                  }}
                >
                  {initial.toLowerCase()}
                </Text>
              )}
            </View>

            {/* Username and Followers count */}
            <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '600',
                  fontFamily: typography.family.sansBold,
                  color: theme.text,
                  letterSpacing: -0.2,
                }}
                numberOfLines={1}
              >
                {member.username}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 6 }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: typography.family.sansMedium,
                    color: theme.mute,
                  }}
                >
                  {member.followers || '0 followers'}
                </Text>
              </View>
            </View>

            {/* Slanted Arrow ↗ matching Image 3 */}
            <Feather name="arrow-up-right" size={21} color={isDark ? '#9CA3AF' : '#4B5563'} />
          </Pressable>
        );
      })}
    </ScrollView>
  );

  return (
    <Animated.View
      style={[
        {
          flex: 1,
          backgroundColor: theme.background,
          shadowColor: '#000',
          shadowOffset: { width: -3, height: 0 },
          shadowOpacity: isDark ? 0.35 : 0.1,
          shadowRadius: 10,
          elevation: 12,
        },
        rootAnimatedStyle,
      ]}
      onTouchStart={Platform.OS === 'web' ? handleTouchStart : undefined}
      onTouchEnd={Platform.OS === 'web' ? handleTouchEnd : undefined}
    >
      {/* ── Top Header Row (Redesigned matching Reference Image 2 & 3) ─── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 8,
          gap: 10,
          borderBottomWidth: 0,
        }}
      >
        {/* Back Button '<' (Always visible on left, matching Reference Image 2 & 3) */}
        <Pressable
          onPress={() => {
            haptic();
            if (hasSubmitted) {
              setHasSubmitted(false);
              inputRef.current?.focus?.();
              setQuery('');
              setSearchFilters(EMPTY_SEARCH_FILTERS);
              ++searchRequestIdRef.current;
              setSellerResults([]);
              setListingResults([]);
              setLoading(false);
            } else {
              handleClose();
            }
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={hasSubmitted ? "Back to search" : "Close search"}
          style={({ pressed }) => ({
            width: 32,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
            transform: [{ scale: pressed ? 0.94 : 1 }],
          })}
        >
          <Feather
            name="chevron-left"
            size={28}
            color={theme.text}
          />
        </Pressable>

        {/* Search Input Box (Pill shape matching Reference Image 2) */}
        <Animated.View
          style={[
            {
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: isDark ? theme.surface : '#F4F4F5',
              borderRadius: radii.pill,
              paddingLeft: 14,
              paddingRight: query.length > 0 ? 8 : 14,
              height: 44,
              borderWidth: 0,
            },
            searchBarAnimatedStyle,
          ]}
        >
          <Feather
            name="search"
            size={18}
            color={isDark ? "#9CA3AF" : "#6B7280"}
            style={{ flexShrink: 0 }}
          />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setHasSubmitted(false);
            }}
            onFocus={() => {
              if (query.trim().length > 0 && hasSubmitted) {
                setHasSubmitted(false);
              }
            }}
            onSubmitEditing={handleSubmitSearch}
            placeholder={searchPlaceholder}
            accessibilityLabel={searchPlaceholder}
            placeholderTextColor={isDark ? "#9CA3AF" : "#8E8E93"}
            autoFocus={Platform.OS === 'web'}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            style={
              {
                flex: 1,
                minWidth: 0,
                flexShrink: 1,
                marginLeft: 8,
                marginRight: query.length > 0 ? 4 : 0,
                fontFamily: typography.family.sans,
                fontSize: 16,
                letterSpacing: -0.15,
                color: theme.text,
                padding: 0,
                outlineStyle: 'none',
                outlineWidth: 0,
              } as any
            }
          />

          {/* Clear "✕" icon inside search pill (only rendered when query text exists) */}
          {query.length > 0 && (
            <Pressable
              onPress={() => {
                haptic();
                setQuery('');
                if (!searchFilters.category) {
                  setHasSubmitted(false);
                  ++searchRequestIdRef.current;
                  setSellerResults([]);
                  setListingResults([]);
                  setLoading(false);
                }
                inputRef.current?.focus?.();
              }}
              hitSlop={8}
              accessibilityLabel="Clear search"
              style={{
                width: 24,
                height: 24,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 2,
              }}
            >
              <Feather name="x" size={16} color={isDark ? "#9CA3AF" : "#6B7280"} />
            </Pressable>
          )}
        </Animated.View>

        {/* After Searching: Save Your Search Star / Favourite Button (Reference Image 3) */}
        {hasSubmitted && (
          <Pressable
            onPress={handleToggleSaveSearch}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={isSaved ? "Saved search active" : "Save this search"}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: isSaved
                ? (isDark ? 'rgba(245, 158, 11, 0.22)' : '#FEF3C7')
                : (isDark ? theme.panel : theme.surface),
              borderWidth: 1,
              borderColor: isSaved
                ? (isDark ? 'rgba(245, 158, 11, 0.5)' : '#FDE68A')
                : theme.border,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.75 : 1,
              transform: [{ scale: pressed ? 0.92 : 1 }],
              shadowColor: isSaved ? '#F59E0B' : '#000000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: isSaved ? 0.35 : 0.05,
              shadowRadius: 6,
              elevation: isSaved ? 3 : 1,
            })}
          >
            <Ionicons
              name={isSaved ? "star" : "star-outline"}
              size={21}
              color={isSaved ? "#F59E0B" : (isDark ? "#9CA3AF" : "#6B7280")}
            />
          </Pressable>
        )}
      </View>

      {/* ── Tab Switcher ('Items' & 'Members') - Hidden when search is completed (hasSubmitted) ── */}
      {!hasSubmitted && (
        <View
          style={{
            flexDirection: 'row',
            borderBottomWidth: 1,
            borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
            position: 'relative',
            backgroundColor: theme.background,
            paddingLeft: 16,
            gap: 24,
            alignItems: 'center',
            height: 44,
          }}
        >
          {/* Items Tab */}
          <Pressable
            onPress={() => handleTabPress('listings')}
            onLayout={(e) => {
              const { x, width } = e.nativeEvent.layout;
              if (width > 0) {
                setTabLayouts((prev) => ({ ...prev, listings: { x, width } }));
              }
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'listings' }}
            style={{
              height: 44,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontSize: 17,
                lineHeight: 22,
                fontWeight: activeTab === 'listings' ? '700' : '500',
                fontFamily: activeTab === 'listings' ? typography.family.sansBold : typography.family.sansMedium,
                color: activeTab === 'listings' ? (isDark ? '#FFFFFF' : '#000000') : (isDark ? '#888888' : '#71717A'),
                letterSpacing: -0.2,
              }}
            >
              Items
            </Text>
          </Pressable>

          {/* Members Tab */}
          <Pressable
            onPress={() => handleTabPress('seller')}
            onLayout={(e) => {
              const { x, width } = e.nativeEvent.layout;
              if (width > 0) {
                setTabLayouts((prev) => ({ ...prev, seller: { x, width } }));
              }
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'seller' }}
            style={{
              height: 44,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontSize: 17,
                lineHeight: 22,
                fontWeight: activeTab === 'seller' ? '700' : '500',
                fontFamily: activeTab === 'seller' ? typography.family.sansBold : typography.family.sansMedium,
                color: activeTab === 'seller' ? (isDark ? '#FFFFFF' : '#000000') : (isDark ? '#888888' : '#71717A'),
                letterSpacing: -0.2,
              }}
            >
              Members
            </Text>
          </Pressable>

          {/* ── Continuous Sliding Black Underline Indicator ── */}
          <RNAnimated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              width: indicatorWidth,
              height: 3,
              backgroundColor: isDark ? '#FFFFFF' : '#000000',
              transform: [{ translateX: indicatorTranslateX }],
            }}
          />
        </View>
      )}

      {/* ── Main Content Area ── */}
      {hasSubmitted ? (
        /* Completed Search Results (Items and Members tab switcher is hidden, as shown in Reference Image 3) */
        <View style={{ flex: 1, backgroundColor: theme.background }}>
          {activeTab === 'listings' ? (
            loading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={theme.purple} />
              </View>
            ) : (
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={{
                  paddingBottom: 40,
                }}
              >
                <SearchFilterChips
                  filters={searchFilters}
                  onUpdateFilter={setSearchFilters}
                  resultCount={displayListings.length}
                />

                {displayListings.length > 0 ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: GRID_GAP,
                      paddingHorizontal: HORIZONTAL_PAD,
                      paddingTop: 8,
                    }}
                  >
                    {displayListings.map((item) => (
                      <View key={item.id} style={{ width: cardWidth }}>
                        <ListingCard listing={item} width={cardWidth} />
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={{ paddingVertical: 48, paddingHorizontal: 20, alignItems: 'center' }}>
                    <Text style={{ fontSize: 14, color: theme.mute, textAlign: 'center' }}>
                      {hasQuery
                        ? `No listings found matching “${query}”`
                        : searchFilters.category
                        ? `No listings found in ${searchFilters.category.charAt(0).toUpperCase() + searchFilters.category.slice(1)}`
                        : 'No listings found'}
                    </Text>
                  </View>
                )}
              </ScrollView>
            )
          ) : (
            /* activeTab === 'seller' */
            loading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={theme.purple} />
              </View>
            ) : sellerResults.length > 0 ? (
              <FlatList
                data={sellerResults}
                keyExtractor={(item) => item.id}
                renderItem={renderSellerItem}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={{ paddingBottom: 40 }}
                ListHeaderComponent={
                  <View
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '600',
                        color: theme.text,
                      }}
                    >
                      {sellerResults.length} {sellerResults.length === 1 ? 'member' : 'members'}
                      {hasQuery ? ` for “${query.trim()}”` : ''}
                    </Text>
                  </View>
                }
              />
            ) : (
              <View style={{ paddingVertical: 48, paddingHorizontal: 20, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: theme.mute, textAlign: 'center' }}>
                  {hasQuery
                    ? `No members found matching “${query.trim()}”`
                    : 'No members found'}
                </Text>
              </View>
            )
          )}
        </View>
      ) : (
        /* Pre-Search State (Horizontal Pager between Items & Members with active Tab Switcher) */
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          scrollEnabled={true}
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: activeTab === 'listings' ? 0 : screenWidth, y: 0 }}
          onScroll={handleScroll}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          scrollEventThrottle={16}
          style={[
            { flex: 1 },
            Platform.OS === 'web' && ({
              scrollSnapType: 'x mandatory',
              WebkitOverflowScrolling: 'touch',
            } as any),
          ]}
          contentContainerStyle={{ width: screenWidth * 2 }}
        >
          {/* ── Page 0: Items ── */}
          <View
            style={[
              { width: screenWidth, flex: 1, backgroundColor: theme.background },
              Platform.OS === 'web' && ({
                scrollSnapAlign: 'start',
                scrollSnapStop: 'always',
                flexShrink: 0,
              } as any),
            ]}
          >
            {!hasQuery && !searchFilters.category ? (
              renderListingsIdleLanding
            ) : (
              <PreSearchSuggestions
                query={query}
                suggestions={suggestions}
                onSelect={handleSelectSuggestion}
                onPopulate={handlePopulateSuggestion}
              />
            )}
          </View>

          {/* ── Page 1: Seller ── */}
          <View
            style={[
              { width: screenWidth, flex: 1, backgroundColor: theme.background },
              Platform.OS === 'web' && ({
                scrollSnapAlign: 'start',
                scrollSnapStop: 'always',
                flexShrink: 0,
              } as any),
            ]}
          >
            {!hasQuery && !searchFilters.category ? (
              renderMembersIdleLanding
            ) : loading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={theme.purple} />
              </View>
            ) : sellerResults.length > 0 ? (
              <FlatList
                data={sellerResults}
                keyExtractor={(item) => item.id}
                renderItem={renderSellerItem}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={{ paddingBottom: 40 }}
                ListHeaderComponent={
                  <View
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '600',
                        color: theme.text,
                      }}
                    >
                      {sellerResults.length} {sellerResults.length === 1 ? 'member' : 'members'}
                      {hasQuery ? ` for “${query.trim()}”` : ''}
                    </Text>
                  </View>
                }
              />
            ) : (
              <View style={{ paddingVertical: 48, paddingHorizontal: 20, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: theme.mute, textAlign: 'center' }}>
                  {hasQuery
                    ? `No members found matching “${query.trim()}”`
                    : 'No members found'}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}
      </Animated.View>
  );
});
