import { useCallback, useMemo, useState } from 'react';
import { View, FlatList, Pressable, RefreshControl, Platform, Alert } from 'react-native';
import { Text } from '@/lib/rnText';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { EmptyState } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import {
  useSavedSearchesQuery,
  useSavedSearchMatchesQuery,
  useDeleteSavedSearch,
} from '@/lib/queries';
import { DropAlertSheet } from '@/components/DropAlertSheet';
import { NewsSkeletonList } from './NewsRowSkeleton';
import { radii, type as typography } from '@/lib/theme';
import type { SavedSearch } from '@/lib/savedSearches';
import { usePullRefresh } from '@/hooks/usePullRefresh';

function haptic() {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

function RowSeparator() {
  const { theme } = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.border, width: '100%' }} />;
}

export function SearchesTab({ bottomInset = 24 }: { bottomInset?: number }) {
  const { theme } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [alertSheetOpen, setAlertSheetOpen] = useState(false);

  const searchesQ = useSavedSearchesQuery(userId);
  const searches = searchesQ.data ?? [];
  const matchesQ = useSavedSearchMatchesQuery(userId, searches);
  const matchCounts = useMemo(() => matchesQ.data?.counts ?? {}, [matchesQ.data?.counts]);
  const deleteM = useDeleteSavedSearch(userId);

  const refetchAll = useCallback(
    () => Promise.all([
      searchesQ.refetch(),
      matchesQ.refetch(),
    ]),
    [searchesQ, matchesQ],
  );
  const { refreshing, onRefresh } = usePullRefresh(refetchAll);

  const handleDelete = useCallback(
    (search: SavedSearch) => {
      const label = search.label || search.query || 'Saved search';
      Alert.alert(
        `Remove "${label}"?`,
        'You will no longer receive drop notifications for this search.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              deleteM.mutate(search.id, {
                onError: () =>
                  toast.show('Could not delete alert', { variant: 'info', icon: 'alert-circle' }),
              });
            },
          },
        ],
      );
    },
    [deleteM, toast],
  );

  const renderSearchItem = useCallback(
    ({ item }: { item: SavedSearch }) => {
      const count = matchCounts[item.id] ?? 0;
      const label = item.label || item.query || 'Custom alert';

      return (
        <Pressable
          onPress={() => {
            haptic();
            if (item.category) {
              router.push(`/?category=${item.category}` as any);
            } else if (item.query) {
              router.push(`/?q=${encodeURIComponent(item.query)}` as any);
            } else {
              router.push(`/?savedId=${item.id}` as any);
            }
          }}
          accessibilityRole="button"
          accessibilityLabel={`Saved search: ${label}`}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 14,
            gap: 12,
            backgroundColor: pressed ? theme.panel : 'transparent',
          })}
        >
          {/* Left: Bookmark circular disc */}
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: count > 0 ? theme.purpleSoft : theme.panel,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <Feather
              name="bookmark"
              size={18}
              color={count > 0 ? theme.purple : theme.ink}
            />
          </View>

          {/* Center: Search metadata */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text
                style={{
                  fontFamily: typography.family.sansBold,
                  fontSize: 15,
                  color: theme.ink,
                }}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
              {item.category && (
                <View
                  style={{
                    paddingHorizontal: 6,
                    paddingVertical: 1,
                    borderRadius: radii.pill,
                    backgroundColor: theme.panel,
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: typography.family.sansMedium,
                      fontSize: 11,
                      color: theme.mute,
                      textTransform: 'capitalize',
                    }}
                  >
                    {item.category}
                  </Text>
                </View>
              )}

              <Text
                style={{
                  fontFamily: typography.family.sans,
                  fontSize: 12,
                  color: count > 0 ? theme.purple : theme.mute,
                  fontWeight: count > 0 ? '600' : 'normal',
                }}
              >
                {count > 0 ? `${count} new item${count === 1 ? '' : 's'}` : 'All caught up'}
              </Text>
            </View>
          </View>

          {/* Right: Delete button / Chevron */}
          <Pressable
            hitSlop={8}
            onPress={(e) => {
              if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
              handleDelete(item);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Delete alert for ${label}`}
            style={({ pressed }) => ({
              width: 32,
              height: 32,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? theme.panel : 'transparent',
            })}
          >
            <Feather name="trash-2" size={15} color={theme.muteSoft} />
          </Pressable>
        </Pressable>
      );
    },
    [matchCounts, theme, handleDelete],
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Create Alert Header Banner */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: theme.hairline,
        }}
      >
        <Text
          style={{
            fontFamily: typography.family.sansBold,
            fontSize: 13,
            color: theme.mute,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
          }}
        >
          Your Drop Alerts ({searches.length})
        </Text>

        <Pressable
          onPress={() => {
            haptic();
            if (!userId) {
              toast.show('Sign in to create drop alerts', { variant: 'info', icon: 'log-in' });
              router.push('/auth/login' as any);
              return;
            }
            setAlertSheetOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Create new drop alert"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: radii.pill,
            backgroundColor: theme.panel,
            borderWidth: 1,
            borderColor: theme.border,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Feather name="plus" size={13} color={theme.ink} />
          <Text
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 12.5,
              color: theme.ink,
            }}
          >
            New alert
          </Text>
        </Pressable>
      </View>

      {searchesQ.isLoading && searches.length === 0 ? (
        <NewsSkeletonList count={4} />
      ) : (
        <FlatList
          data={searches}
          keyExtractor={(item) => item.id}
          renderItem={renderSearchItem}
          ItemSeparatorComponent={RowSeparator}
          contentContainerStyle={
            searches.length === 0 ? { flex: 1 } : { paddingBottom: bottomInset }
          }
          removeClippedSubviews={Platform.OS === 'android'}
          ListEmptyComponent={
            <EmptyState
              icon="bookmark"
              title="No saved searches yet"
              description="Track your favorite brands, aesthetics, or categories to get instant alerts whenever new matching items drop."
              cta={{
                label: 'Create an alert',
                icon: 'plus',
                onPress: () => {
                  if (!userId) {
                    router.push('/auth/login' as any);
                  } else {
                    setAlertSheetOpen(true);
                  }
                },
              }}
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.purple}
            />
          }
        />
      )}

      {userId ? (
        <DropAlertSheet
          visible={alertSheetOpen}
          userId={userId}
          onClose={() => setAlertSheetOpen(false)}
          onCreated={() => {
            searchesQ.refetch();
          }}
        />
      ) : null}
    </View>
  );
}
