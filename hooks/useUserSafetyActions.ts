// ─────────────────────────────────────────────────────────────────────────────
// USE USER SAFETY ACTIONS HOOK (UNIFIED MODAL & SAFETY ORCHESTRATION)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Centralized Safety Workflow & Moderation Guardrails
//
// 1. DRY Safety Invariants:
//    Reporting and blocking are critical trust-and-safety actions that occur on
//    multiple screens: Product Details, Seller Profiles, and Conversation Threads.
//    Centralizing them in `useUserSafetyActions` guarantees consistent validation
//    (self-action prevention, guest authentication guards, localized reason pickers,
//    and async moderation database tracking).
//
// 2. Elimination of Prop-Drilling:
//    Components can invoke `reportUser`, `blockUser`, or `showSafetySheet` directly
//    without parent screens having to thread 10+ modal callbacks and state flags
//    down deep component trees.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useGuestGate } from '@/components/GuestGate';
import { reportListing, reportUser, REPORT_REASONS, SELLER_REPORT_REASONS } from '@/lib/reports';
import { blockUser, unblockUser, refreshAfterBlockChange } from '@/lib/blocks';
import { capture } from '@/lib/analytics';
import { tap } from '@/lib/haptics';
import { SUPPORT_BOT_USER_ID } from '@/lib/support';

type SafetyActionOptions = {
  onBlocked?: (blockedUserId: string) => void;
  onUnblocked?: (unblockedUserId: string) => void;
  onReported?: () => void;
};

export function useUserSafetyActions(options: SafetyActionOptions = {}) {
  const { user } = useAuth();
  const toast = useToast();
  const guestGate = useGuestGate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  // ── 1. Report User Action ────────────────────────────────────────────────
  const handleReportUser = useCallback(
    async (targetUserId: string, targetUsername?: string, listingId?: string | null) => {
      tap('light');
      if (!user) {
        toast.show('Sign in to submit a report', { variant: 'info', icon: 'log-in' });
        router.push('/auth/login');
        return;
      }
      if (user.id === targetUserId) {
        toast.show("You can't report your own account", { variant: 'default', icon: 'info' });
        return;
      }

      const userLabel = targetUsername ? `@${targetUsername}` : 'this user';

      Alert.alert(
        `Report ${userLabel}`,
        'Why are you reporting this user?',
        [
          ...SELLER_REPORT_REASONS.map((r) => ({
            text: r.label,
            onPress: async () => {
              setBusy(true);
              try {
                const ok = await reportUser({
                  reporterId: user.id,
                  reportedUserId: targetUserId,
                  reason: r.id,
                  listingId: listingId ?? null,
                });

                if (ok) {
                  capture('user_reported', { reported_user_id: targetUserId, reason: r.id });
                  toast.done('Thanks — our team will review this report.');
                  options.onReported?.();
                } else {
                  toast.show("Couldn't submit report. Please try again.", {
                    variant: 'default',
                    icon: 'alert-triangle',
                  });
                }
              } finally {
                setBusy(false);
              }
            },
          })),
          { text: 'Cancel', style: 'cancel' as const },
        ],
      );
    },
    [user, toast, options],
  );

  // ── 2. Report Listing Action ─────────────────────────────────────────────
  const handleReportListing = useCallback(
    async (listingId: string, sellerId?: string | null) => {
      tap('light');
      if (!user) {
        toast.show('Sign in to report a listing', { variant: 'info', icon: 'log-in' });
        router.push('/auth/login');
        return;
      }
      if (sellerId && user.id === sellerId) {
        toast.show("You can't report your own listing", { variant: 'default', icon: 'info' });
        return;
      }

      Alert.alert(
        'Report Listing',
        'Why are you reporting this item?',
        [
          ...REPORT_REASONS.map((r) => ({
            text: r.label,
            onPress: async () => {
              setBusy(true);
              try {
                const ok = await reportListing({
                  listingId,
                  reporterId: user.id,
                  reportedUserId: sellerId ?? null,
                  reason: r.id,
                });

                if (ok) {
                  capture('listing_reported', { listing_id: listingId, reason: r.id });
                  toast.done('Thanks — our team will review this listing.');
                  options.onReported?.();
                } else {
                  toast.show("Couldn't submit report", {
                    variant: 'default',
                    icon: 'alert-triangle',
                  });
                }
              } finally {
                setBusy(false);
              }
            },
          })),
          { text: 'Cancel', style: 'cancel' as const },
        ],
      );
    },
    [user, toast, options],
  );

  // ── 3. Block User Action ─────────────────────────────────────────────────
  const handleBlockUser = useCallback(
    async (targetUserId: string, targetUsername?: string) => {
      tap('light');
      if (!user) {
        guestGate.prompt({
          title: 'Sign in to block',
          message: 'Create a free account to manage user safety and block contacts.',
          icon: 'slash',
        });
        return;
      }
      if (user.id === targetUserId) {
        toast.show("You can't block yourself", { variant: 'default', icon: 'info' });
        return;
      }
      if (targetUserId === SUPPORT_BOT_USER_ID) {
        toast.show("Grabsty Support can't be blocked", { variant: 'default', icon: 'info' });
        return;
      }

      const userLabel = targetUsername ? `@${targetUsername}` : 'this user';

      Alert.alert(
        `Block ${userLabel}?`,
        "You won't see each other's listings, and they can't message you, make offers or buy from you. Orders already in progress will continue.",
        [
          { text: 'Cancel', style: 'cancel' as const },
          {
            text: 'Block User',
            style: 'destructive' as const,
            onPress: async () => {
              setBusy(true);
              try {
                const ok = await blockUser({
                  blockerId: user.id,
                  blockedId: targetUserId,
                });

                if (ok) {
                  capture('user_blocked', { blocked_user_id: targetUserId });
                  toast.done(`Blocked ${userLabel}`, 'slash');
                  refreshAfterBlockChange(queryClient);
                  options.onBlocked?.(targetUserId);
                } else {
                  toast.show("Couldn't block user", { variant: 'default', icon: 'alert-triangle' });
                }
              } finally {
                setBusy(false);
              }
            },
          },
        ],
      );
    },
    [user, guestGate, toast, options, queryClient],
  );

  // ── 4. Unblock User Action ───────────────────────────────────────────────
  const handleUnblockUser = useCallback(
    async (targetUserId: string, targetUsername?: string) => {
      if (!user) return;
      const userLabel = targetUsername ? `@${targetUsername}` : 'this user';

      Alert.alert(
        `Unblock ${userLabel}?`,
        'They will be able to message you and purchase your items again.',
        [
          { text: 'Cancel', style: 'cancel' as const },
          {
            text: 'Unblock',
            onPress: async () => {
              setBusy(true);
              try {
                const ok = await unblockUser({
                  blockerId: user.id,
                  blockedId: targetUserId,
                });

                if (ok) {
                  toast.done(`Unblocked ${userLabel}`);
                  refreshAfterBlockChange(queryClient);
                  options.onUnblocked?.(targetUserId);
                } else {
                  toast.show("Couldn't unblock user", {
                    variant: 'default',
                    icon: 'alert-triangle',
                  });
                }
              } finally {
                setBusy(false);
              }
            },
          },
        ],
      );
    },
    [user, toast, options, queryClient],
  );

  // ── 5. Safety Sheet Hub Action ───────────────────────────────────────────
  const showSafetySheet = useCallback(
    (targetUserId: string, targetUsername?: string, listingId?: string | null) => {
      const userLabel = targetUsername ? `@${targetUsername}` : 'User';
      Alert.alert(
        userLabel,
        'Safety and moderation options',
        [
          {
            text: 'Report User',
            style: 'destructive' as const,
            onPress: () => handleReportUser(targetUserId, targetUsername, listingId),
          },
          {
            text: 'Block User',
            style: 'destructive' as const,
            onPress: () => handleBlockUser(targetUserId, targetUsername),
          },
          { text: 'Cancel', style: 'cancel' as const },
        ],
      );
    },
    [handleReportUser, handleBlockUser],
  );

  return {
    busy,
    reportUser: handleReportUser,
    reportListing: handleReportListing,
    blockUser: handleBlockUser,
    unblockUser: handleUnblockUser,
    showSafetySheet,
  };
}
