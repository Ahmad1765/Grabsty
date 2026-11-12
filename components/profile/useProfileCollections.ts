// ─────────────────────────────────────────────────────────────────────────────
// USE PROFILE COLLECTIONS HOOK
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Client-Side Collection State & Prompt Orchestration
// Encapsulates all custom save list operations (creation, renaming, deletion,
// and optimistic TanStack cache updates) with prompt dialog lifecycle management.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { usePrompt } from '@/components/PromptDialog';
import { useToast } from '@/lib/toast';
import {
  useSaveListsQuery,
  useListingsInListQuery,
  qk,
} from '@/lib/queries';
import {
  createSaveList,
  deleteSaveList,
  renameSaveList,
  type SaveList,
} from '@/lib/saves';

const EMPTY_SAVE_LISTS: SaveList[] = [];

// The lists every account is seeded with (ensure_save_lists) carry
// is_starter. The name match is only for a backend that doesn't have that
// column yet.
const STARTER_LIST_NAMES = new Set(['wishlist', 'gift ideas', 'saved for later']);

/**
 * Profile chip row = All, then the collections, then +.
 * A collection the user created always shows, so a new one appears right
 * away. The seeded ones (Saved, Wishlist, Gift ideas, Saved for later) show
 * only while they hold something.
 */
export const isVisibleListChip = (l: Pick<SaveList, 'is_default' | 'is_starter' | 'item_count' | 'name'>) =>
  (l.item_count ?? 0) > 0 ||
  (!l.is_default && !(l.is_starter ?? STARTER_LIST_NAMES.has(l.name.trim().toLowerCase())));

type UseProfileCollectionsProps = {
  userId: string | null;
  savedRefetch: () => void;
};

export function useProfileCollections({
  userId,
  savedRefetch,
}: UseProfileCollectionsProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { prompt, element: promptElement } = usePrompt();
  const [activeListId, setActiveListId] = useState<string | null>(null);

  const saveListsQ = useSaveListsQuery(userId);
  const listInListQ = useListingsInListQuery(activeListId);

  const saveLists = saveListsQ.data ?? EMPTY_SAVE_LISTS;
  const listListings = listInListQ.data ?? [];
  const loadingListListings = listInListQ.isLoading;
  const saveListsRefetch = saveListsQ.refetch;

  // A selected chip that stops being shown (last item unsaved) falls back to All.
  useEffect(() => {
    if (!activeListId || !saveListsQ.isSuccess) return;
    const active = saveLists.find((l) => l.id === activeListId);
    if (!active || !isVisibleListChip(active)) setActiveListId(null);
  }, [activeListId, saveLists, saveListsQ.isSuccess]);

  const handleCreateList = useCallback(async () => {
    if (!userId) return;
    const name = await prompt({
      title: 'New list',
      message: 'Name your save list',
      placeholder: 'e.g. Summer outfits',
      submitLabel: 'Create',
    });
    if (!name) return;
    const created = await createSaveList(userId, name);
    if (created) {
      queryClient.setQueryData<SaveList[]>(qk.saveLists(userId), (prev) => [
        ...(prev ?? []),
        { ...created, item_count: 0 },
      ]);
      // The new chip appears in the row; stay on All rather than an empty list.
      toast.done('List created');
    } else {
      toast.show("Couldn't create list", { variant: 'info', icon: 'alert-circle' });
    }
  }, [userId, prompt, toast, queryClient]);

  const handleManageList = useCallback(
    (list: SaveList) => {
      if (list.is_default) {
        toast.show("Default list can't be edited", { variant: 'info', icon: 'info' });
        return;
      }
      Alert.alert(list.name, undefined, [
        {
          text: 'Rename',
          onPress: async () => {
            const next = await prompt({
              title: 'Rename list',
              defaultValue: list.name,
              submitLabel: 'Save',
            });
            if (!next) return;
            const ok = await renameSaveList(list.id, next);
            if (ok) {
              queryClient.setQueryData<SaveList[]>(qk.saveLists(userId), (prev) =>
                (prev ?? []).map((l) => (l.id === list.id ? { ...l, name: next } : l)),
              );
            }
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const ok = await deleteSaveList(list.id);
            if (!ok) {
              toast.show("Couldn't delete list", { variant: 'info', icon: 'alert-circle' });
              return;
            }
            queryClient.setQueryData<SaveList[]>(qk.saveLists(userId), (prev) =>
              (prev ?? []).filter((l) => l.id !== list.id),
            );
            if (activeListId === list.id) setActiveListId(null);
            savedRefetch();
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [activeListId, userId, prompt, toast, queryClient, savedRefetch],
  );

  return {
    saveLists,
    activeListId,
    setActiveListId,
    listListings,
    loadingListListings,
    saveListsRefetch,
    handleCreateList,
    handleManageList,
    promptElement,
  };
}
