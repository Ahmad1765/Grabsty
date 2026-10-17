import { useCallback, useMemo } from 'react';
import { View, FlatList, RefreshControl, Platform } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { EmptyState } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useInboxQuery } from '@/lib/queries';
import { isDirectConversation } from '@/lib/support';
import { type ConversationRow } from '@/lib/chat';
import { usePullRefresh } from '@/hooks/usePullRefresh';
import { InboxRow } from '@/components/chat/InboxRow';

const EMPTY_CONVERSATIONS: ConversationRow[] = [];
const keyById = (item: ConversationRow) => item.id;

function ActivitySeparator() {
  const { theme } = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.hairline }} />;
}

type Props = {
  bottomInset?: number;
};

export function ActivityFeed({ bottomInset = 24 }: Props) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const inboxQ = useInboxQuery(userId);
  const conversations = inboxQ.data ?? EMPTY_CONVERSATIONS;

  // Filter direct profile messages:
  // Activity is strictly for people who message you directly — NOT for buying or giving offers
  const directMessages = useMemo(() => {
    return conversations.filter(isDirectConversation);
  }, [conversations]);

  const { refetch: inboxRefetch, isStale: inboxStale } = inboxQ;

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      if (inboxStale) inboxRefetch();
    }, [userId, inboxStale, inboxRefetch]),
  );

  const { refreshing, onRefresh } = usePullRefresh(inboxRefetch);

  const renderItem = useCallback(
    ({ item }: { item: ConversationRow }) => (
      <InboxRow
        conv={item}
        userId={userId || ''}
        onPress={() => router.push(`/conversation/${item.id}` as any)}
      />
    ),
    [userId],
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <FlatList
        style={{ flex: 1 }}
        data={directMessages}
        keyExtractor={keyById}
        renderItem={renderItem}
        ItemSeparatorComponent={ActivitySeparator}
        windowSize={7}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews={Platform.OS === 'android'}
        ListEmptyComponent={
          !inboxQ.isLoading ? (
            <EmptyState
              icon="users"
              title="No direct messages yet"
              description="When you message creators directly through their profile, they’ll appear here."
            />
          ) : null
        }
        contentContainerStyle={
          directMessages.length === 0 ? { flex: 1 } : { paddingBottom: bottomInset }
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
          />
        }
      />
    </View>
  );
}
