// ─────────────────────────────────────────────────────────────────────────────
// USE CONVERSATION BLOCK HOOK
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Asynchronous Request Cancellation via Counter Refs
//
// When checking permissions or relationship states across rapidly switching screens,
// race conditions can occur if a slower network request finishes after a user
// has already navigated.
// By incrementing `blockCheckReqIdRef.current`, we ensure that only the latest
// dispatched request can update state, discarding stale async results.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import type { User as AuthUser } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/lib/toast';
import { confirm } from '@/lib/confirm';
import { blockUser, unblockUser, getBlockRelation, refreshAfterBlockChange } from '@/lib/blocks';

export type BlockStatus = 'loading' | 'blocked' | 'unblocked' | 'unavailable';

export function useConversationBlock(
  user: AuthUser | null,
  other: { id?: string; username?: string | null; full_name?: string | null } | null,
) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [blockStatus, setBlockStatus] = useState<BlockStatus>('loading');
  const [blockSheetOpen, setBlockSheetOpen] = useState(false);
  const isBlocked = blockStatus === 'blocked';
  const blockCheckReqIdRef = useRef(0);

  useEffect(() => {
    if (!user?.id || !other?.id) {
      setBlockStatus('unavailable');
      return;
    }
    let active = true;
    const currentReqId = ++blockCheckReqIdRef.current;
    setBlockStatus('loading');

    getBlockRelation(user.id, other.id)
      .then((relation) => {
        if (!active || currentReqId !== blockCheckReqIdRef.current) return;
        // 'unavailable' when they blocked you: the banner says messaging is off
        // without announcing who did what.
        setBlockStatus(relation === 'blocked_by_me' ? 'blocked' : relation === 'blocked_me' ? 'unavailable' : 'unblocked');
      })
      .catch((err) => {
        if (!active || currentReqId !== blockCheckReqIdRef.current) return;
        console.warn('[conversation] failed to check block status', err);
        setBlockStatus('unblocked');
      });

    return () => {
      active = false;
    };
  }, [user?.id, other?.id]);

  const handleToggleBlock = useCallback(async () => {
    if (!user?.id || !other?.id) return;
    const targetName = other.username ? `@${other.username}` : (other.full_name || 'this user');

    if (isBlocked) {
      const ok = await confirm({
        title: `Unblock ${targetName}?`,
        message: 'They will be able to message you and interact with your listings again.',
        confirmLabel: 'Unblock',
        cancelLabel: 'Cancel',
      });
      if (!ok) return;

      blockCheckReqIdRef.current++;
      const success = await unblockUser({ blockerId: user.id, blockedId: other.id });
      if (success) {
        setBlockStatus('unblocked');
        toast.done(`Unblocked ${targetName}`);
        refreshAfterBlockChange(queryClient);
      } else {
        setBlockStatus('blocked');
        toast.show('Failed to unblock user. Please try again.');
      }
    } else {
      setBlockSheetOpen(true);
    }
  }, [user?.id, other?.id, other?.username, other?.full_name, isBlocked, toast, queryClient]);

  const handleBlockWithReason = useCallback(
    async (reasonLabel: string) => {
      if (!user?.id || !other?.id) return;
      setBlockSheetOpen(false);
      const targetName = other.username ? `@${other.username}` : (other.full_name || 'this user');

      blockCheckReqIdRef.current++;
      const success = await blockUser({
        blockerId: user.id,
        blockedId: other.id,
        reason: reasonLabel,
      });

      if (success) {
        setBlockStatus('blocked');
        toast.done(`Blocked ${targetName}`, 'slash');
        refreshAfterBlockChange(queryClient);
      } else {
        toast.show('Failed to block user. Please try again.');
      }
    },
    [user?.id, other?.id, other?.username, other?.full_name, toast, queryClient],
  );

  return {
    blockStatus,
    isBlocked,
    blockSheetOpen,
    setBlockSheetOpen,
    handleToggleBlock,
    handleBlockWithReason,
  };
}
