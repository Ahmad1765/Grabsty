// ─────────────────────────────────────────────────────────────────────────────
// PROFILE LISTING TABS (PRESENTATIONAL)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Segmented Grid Navigation & Playlist Filtering
// Houses the TikTok-style 4-segment tab bar, horizontal save list playlists,
// and tailored empty state messages.
// ─────────────────────────────────────────────────────────────────────────────

import { memo } from 'react';
import { View, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { EmptyState } from '@/components/ui';
import type { SaveList } from '@/lib/saves';
import { StatusFilterChips } from './StatusFilterChips';

export type ProfileTab = 'selling' | 'liked' | 'collections' | 'details';

type ProfileListingTabsProps = {
  activeTab: ProfileTab;
  setActiveTab: (t: ProfileTab) => void;
  activeListId: string | null;
  setActiveListId: (id: string | null) => void;
  sellingCount: number;
  savedCount: number;
  saveLists: SaveList[];
  onCreateList: () => void;
  onManageList: (l: SaveList) => void;
  loadingListings: boolean;
  gridListingsCount: number;
  onPostItem: () => void;
  statusFilter?: 'all' | 'available' | 'sold';
  setStatusFilter?: (f: 'all' | 'available' | 'sold') => void;
  totalCount?: number;
  availableCount?: number;
  soldCount?: number;
};

export const ProfileListingTabs = memo(function ProfileListingTabs({
  activeTab,
  setActiveTab,
  activeListId,
  setActiveListId,
  sellingCount,
  savedCount,
  saveLists,
  onCreateList,
  onManageList,
  loadingListings,
  gridListingsCount,
  onPostItem,
  statusFilter = 'all',
  setStatusFilter,
  totalCount = 0,
  availableCount = 0,
  soldCount = 0,
}: ProfileListingTabsProps) {
  const { theme, isDark } = useTheme();
  // A status filter is narrowing a non-empty list (vs. the list itself being empty).
  const filtered = activeTab !== 'collections' && statusFilter !== 'all' && totalCount > 0;
  return (
    <>
      {/* ── 3-Segment Icon Tab Bar ── */}
      <View
        style={{
          flexDirection: 'row',
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          marginTop: 18,
        }}
      >
        {/* Tab 1: Video Grid / Selling */}
        <Pressable
          onPress={() => setActiveTab('selling')}
          accessibilityRole="tab"
          accessibilityLabel="Selling"
          accessibilityState={{ selected: activeTab === 'selling' }}
          style={{
            flex: 1,
            alignItems: 'center',
            paddingVertical: 12,
            position: 'relative',
          }}
        >
          <Ionicons
            name="grid-outline"
            size={20}
            color={activeTab === 'selling' ? colors.ink : colors.mute}
          />
          {activeTab === 'selling' && (
            <View
              style={{
                position: 'absolute',
                bottom: -1,
                height: 2.5,
                width: 44,
                backgroundColor: colors.ink,
                borderRadius: 2,
              }}
            />
          )}
        </Pressable>

        {/* Tab 2: Liked */}
        <Pressable
          onPress={() => setActiveTab('liked')}
          accessibilityRole="tab"
          accessibilityLabel="Liked"
          accessibilityState={{ selected: activeTab === 'liked' }}
          style={{
            flex: 1,
            alignItems: 'center',
            paddingVertical: 12,
            position: 'relative',
          }}
        >
          <Ionicons
            name={activeTab === 'liked' ? 'heart' : 'heart-outline'}
            size={21}
            color={activeTab === 'liked' ? colors.ink : colors.mute}
          />
          {activeTab === 'liked' && (
            <View
              style={{
                position: 'absolute',
                bottom: -1,
                height: 2.5,
                width: 44,
                backgroundColor: colors.ink,
                borderRadius: 2,
              }}
            />
          )}
        </Pressable>

        {/* Tab 3: Saved / Collections */}
        <Pressable
          onPress={() => setActiveTab('collections')}
          accessibilityRole="tab"
          accessibilityLabel="Collections"
          accessibilityState={{ selected: activeTab === 'collections' }}
          style={{
            flex: 1,
            alignItems: 'center',
            paddingVertical: 12,
            position: 'relative',
          }}
        >
          <Ionicons
            name={activeTab === 'collections' ? 'bookmark' : 'bookmark-outline'}
            size={20}
            color={activeTab === 'collections' ? colors.ink : colors.mute}
          />
          {activeTab === 'collections' && (
            <View
              style={{
                position: 'absolute',
                bottom: -1,
                height: 2.5,
                width: 44,
                backgroundColor: colors.ink,
                borderRadius: 2,
              }}
            />
          )}
        </Pressable>

      </View>

      {/* ── Playlist Strip (Collections Tab) ── */}
      {activeTab === 'collections' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingTop: 10,
            paddingBottom: 4,
            gap: 8,
          }}
        >
          <Pressable
            onPress={() => setActiveListId(null)}
            accessibilityRole="button"
            accessibilityState={{ selected: activeListId === null }}
            style={({ pressed }) => {
              const active = activeListId === null;
              return {
                height: 30,
                paddingHorizontal: 14,
                borderRadius: 15,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: active
                  ? isDark ? theme.panel : '#111111'
                  : isDark ? theme.surface : theme.panel,
                borderWidth: 1,
                borderColor: active
                  ? isDark ? theme.border : '#111111'
                  : theme.border,
                opacity: pressed ? 0.7 : 1,
              };
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '700',
                color: activeListId === null ? '#FFFFFF' : theme.ink,
              }}
            >
              All ({savedCount})
            </Text>
          </Pressable>

          {saveLists.map((list) => {
            const isListActive = activeListId === list.id;
            return (
              <Pressable
                key={list.id}
                onPress={() => setActiveListId(list.id)}
                onLongPress={() => onManageList(list)}
                accessibilityRole="button"
                accessibilityState={{ selected: isListActive }}
                style={({ pressed }) => ({
                  height: 30,
                  paddingHorizontal: 14,
                  borderRadius: 15,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isListActive
                    ? isDark ? theme.panel : '#111111'
                    : isDark ? theme.surface : theme.panel,
                  borderWidth: 1,
                  borderColor: isListActive
                    ? isDark ? theme.border : '#111111'
                    : theme.border,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: isListActive ? '#FFFFFF' : theme.ink,
                  }}
                >
                  {list.name} ({list.item_count ?? 0})
                </Text>
              </Pressable>
            );
          })}

          <Pressable
            onPress={onCreateList}
            accessibilityRole="button"
            accessibilityLabel="Create collection"
            style={({ pressed }) => ({
              width: 30,
              height: 30,
              borderRadius: 15,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: isDark ? theme.surface : theme.panel,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Feather name="plus" size={14} color={theme.ink} />
          </Pressable>
        </ScrollView>
      )}

      {/* Collection + Liked keep All/Available/Sold, even at zero counts; Saved has its own list chips */}
      {activeTab !== 'collections' && setStatusFilter ? (
        <StatusFilterChips
          value={statusFilter}
          onChange={setStatusFilter}
          total={totalCount}
          available={availableCount}
          sold={soldCount}
        />
      ) : activeTab !== 'collections' ? (
        <View style={{ height: 12 }} />
      ) : null}

      {/* ── Empty States for Lists ── */}
      {loadingListings ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={colors.purple} />
        </View>
      ) : gridListingsCount === 0 ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <EmptyState
            icon={
              activeTab === 'liked'
                ? 'heart'
                : activeTab === 'collections'
                  ? 'bookmark'
                  : 'shopping-bag'
            }
            title={
              filtered && statusFilter === 'sold'
                ? 'Nothing sold yet'
                : filtered && statusFilter === 'available'
                  ? 'No available items'
                  : activeTab === 'liked'
                    ? 'No liked items'
                    : activeTab === 'collections'
                      ? 'No saved items'
                      : 'Your shop is empty'
            }
            description={
              filtered && statusFilter === 'sold'
                ? 'Sold items will show up here.'
                : filtered && statusFilter === 'available'
                  ? 'Everything here has been sold.'
                  : activeTab === 'selling'
                    ? 'Post your first item — takes less than a minute.'
                    : 'Items you interact with will show up here.'
            }
            cta={
              activeTab === 'selling' && totalCount === 0
                ? {
                    label: 'Post an item',
                    icon: 'plus',
                    onPress: onPostItem,
                  }
                : undefined
            }
          />
        </View>
      ) : null}
    </>
  );
});
