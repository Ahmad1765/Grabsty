import { FlatList, Pressable, RefreshControl, View, ActivityIndicator } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/context/ThemeContext';
import { listBlockedUsers } from '@/lib/blocks';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { radii } from '@/lib/theme';
import { safeBack } from '@/lib/nav';
import { getOptimizedImageUrl } from '@/lib/images';
import { EmptyState } from '@/components/ui';
import { useUserSafetyActions } from '@/hooks/useUserSafetyActions';

export default function BlockedUsersScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const safety = useUserSafetyActions();
  const q = useQuery({
    queryKey: ['blockedUsers', user?.id],
    enabled: !!user,
    queryFn: () => listBlockedUsers(user!.id),
  });

  let body;
  if (!user) {
    body = <EmptyState icon="log-in" title="Sign in to manage blocks" description="Blocked accounts are saved to your account." />;
  } else if (q.isPending) {
    body = <ActivityIndicator style={{ marginTop: 40 }} color={theme.purple} />;
  } else if (q.isError) {
    body = (
      <EmptyState
        icon="wifi-off"
        title="Couldn't load blocked accounts"
        description="Check your connection and try again."
        cta={{ label: 'Try again', onPress: () => q.refetch() }}
      />
    );
  } else {
    body = (
      <FlatList
        data={q.data}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={theme.purple} />}
        ListEmptyComponent={
          <EmptyState
            icon="slash"
            title="No blocked accounts"
            description="People you block appear here, and you can unblock them at any time."
          />
        }
        renderItem={({ item }) => {
          const name = item.full_name || item.username || 'Grabsty member';
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
              <Pressable
                onPress={() => router.push(`/user/${item.id}` as any)}
                accessibilityRole="button"
                accessibilityLabel={`View ${name}'s profile`}
                style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.6 : 1 })}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    overflow: 'hidden',
                    backgroundColor: theme.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {item.avatar_url ? (
                    <Image
                      source={{ uri: getOptimizedImageUrl(item.avatar_url, { width: 88 }) }}
                      style={{ width: '100%', height: '100%' }}
                    />
                  ) : (
                    <Text style={{ fontSize: 16, fontWeight: '700', color: theme.ink }}>{name.charAt(0).toUpperCase()}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '700', color: theme.ink }}>{name}</Text>
                  {item.username ? (
                    <Text numberOfLines={1} style={{ fontSize: 13, color: theme.mute }}>@{item.username}</Text>
                  ) : null}
                </View>
              </Pressable>
              <Pressable
                testID={`unblock-${item.id}`}
                onPress={() => safety.unblockUser(item.id, item.username ?? undefined)}
                accessibilityRole="button"
                accessibilityLabel={`Unblock ${name}`}
                style={({ pressed }) => ({
                  height: 30,
                  paddingHorizontal: 14,
                  borderRadius: radii.pill,
                  borderWidth: 1,
                  borderColor: theme.border,
                  backgroundColor: theme.panel,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: theme.ink }}>Unblock</Text>
              </Pressable>
            </View>
          );
        }}
      />
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: theme.background }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 14,
          paddingTop: 6,
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderBottomColor: theme.hairline,
        }}
      >
        <Pressable
          onPress={() => safeBack()}
          hitSlop={HIT_SLOP_8}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => ({ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
        >
          <Feather name="chevron-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>Blocked accounts</Text>
        <View style={{ width: 38 }} />
      </View>
      {body}
    </SafeAreaView>
  );
}
