// ─────────────────────────────────────────────────────────────────────────────
// USE PRODUCT BUNDLE HOOK
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Immutable State Collections & Domain State Isolation
//
// 1. Immutable Set State:
//    React re-renders depend on reference changes. Modifying a `Set` in place (e.g.
//    `set.add(id)`) doesn't trigger re-renders. We always construct a `new Set(prev)`
//    when toggling bundle selections.
//
// 2. Cross-Screen State Reset:
//    When a user taps a related product, we reset `selectedBundleIds` so items from
//    the previous seller don't bleed into the next product page.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import type { User as AuthUser } from '@supabase/supabase-js';
import { useToast } from '@/lib/toast';
import { tap } from '@/components/product/shared';
import type { useGuestGate } from '@/components/GuestGate';
import type { Listing } from '@/types';

type UseProductBundleProps = {
  listing: Listing | null;
  sellerItems: Listing[];
  user: AuthUser | null;
  guestGate: ReturnType<typeof useGuestGate>;
  /** When false the bundle progress banner is hidden. */
  bundlesEnabled?: boolean;
  sellerItemsLoading?: boolean;
  onOpenOfferSheet?: () => void;
};

export function serializeBundleIds(ids: string[] | Iterable<string>): string {
  const arr = Array.isArray(ids) ? ids : Array.from(ids);
  return arr.join(',');
}

export const serializeBundleItemIds = serializeBundleIds;

export function useProductBundle({
  listing,
  sellerItems,
  user,
  guestGate,
  bundlesEnabled = false,
  sellerItemsLoading = false,
  onOpenOfferSheet,
}: UseProductBundleProps) {
  const toast = useToast();
  const [selectedBundleIds, setSelectedBundleIds] = useState<Set<string>>(new Set());
  // Always open on the seller's items. Deciding from sellerItems.length here was
  // wrong: they load async, so it was 0 on first render and 'similar' always won.
  const [relatedTab, setRelatedTab] = useState<'members' | 'similar'>('members');

  // Reset bundle selection and tab whenever the viewed listing changes
  useEffect(() => {
    setSelectedBundleIds(new Set());
    setRelatedTab('members');
  }, [listing?.id]);

  // If any item in the bundle is bought by another buyer, automatically remove it and cancel bundle if only 1 item remains
  useEffect(() => {
    if (sellerItemsLoading || selectedBundleIds.size === 0) return;
    const soldOrMissingIds: string[] = [];
    selectedBundleIds.forEach((id) => {
      const found = sellerItems.find((s) => s.id === id);
      if (!found || found.is_sold) {
        soldOrMissingIds.push(id);
      }
    });

    if (soldOrMissingIds.length > 0) {
      setSelectedBundleIds((prev) => {
        const next = new Set(prev);
        soldOrMissingIds.forEach((id) => next.delete(id));
        return next;
      });
      toast.show('An item in your bundle was purchased by someone else and removed', {
        variant: 'default',
        icon: 'info',
      });
    }
  }, [sellerItems, selectedBundleIds, sellerItemsLoading, toast]);

  useEffect(() => {
    if (listing?.is_sold && selectedBundleIds.size > 0) {
      setSelectedBundleIds(new Set());
      toast.show('This item was purchased by someone else', {
        variant: 'default',
        icon: 'info',
      });
    }
  }, [listing?.is_sold, selectedBundleIds.size, toast]);

  const handleToggleBundleItem = useCallback((id: string) => {
    tap('selection');
    setSelectedBundleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAllBundle = useCallback(() => {
    tap('medium');
    setSelectedBundleIds(new Set(sellerItems.filter((s) => !s.is_sold).map((s) => s.id)));
  }, [sellerItems]);

  const handleClearAllBundle = useCallback(() => {
    tap('selection');
    setSelectedBundleIds(new Set());
  }, []);

  const handleBuyBundle = useCallback(
    (_total: number, selectedItemIds?: string[]) => {
      tap('medium');
      if (!user) {
        guestGate.prompt({
          title: 'Sign in to bundle',
          message: 'Create a free account to buy bundled items with a discount.',
          icon: 'package',
        });
        return;
      }
      if (!listing) return;
      if (listing.is_sold) {
        toast.show('This item is already sold', { variant: 'default', icon: 'info' });
        return;
      }
      if (listing.seller_id === user.id) {
        toast.show("That's your own listing", { variant: 'default', icon: 'info' });
        return;
      }
      const ids = selectedItemIds ?? Array.from(selectedBundleIds);
      const params: Record<string, string> = {};
      if (ids.length > 0) {
        params.bundle_ids = serializeBundleIds(ids);
      }
      router.push({
        pathname: `/payment/${listing.id}`,
        params,
      } as any);
    },
    [user, listing, selectedBundleIds, guestGate, toast],
  );

  const handleSendBundleOffer = useCallback(
    (amount: number, selectedItemIds?: string[]) => {
      tap('medium');
      if (!user) {
        guestGate.prompt({
          title: 'Send a bundle offer',
          message: 'Create a free account to bundle items and send the seller an offer.',
          icon: 'message-circle',
        });
        return;
      }
      if (!listing) return;
      if (listing.is_sold) {
        toast.show('This item is already sold', { variant: 'default', icon: 'info' });
        return;
      }
      if (listing.seller_id === user.id) {
        toast.show("That's your own listing", { variant: 'default', icon: 'info' });
        return;
      }
      if (onOpenOfferSheet) {
        onOpenOfferSheet();
        return;
      }
      const ids = selectedItemIds ?? Array.from(selectedBundleIds);
      const params: Record<string, string> = {
        listing: listing.id,
        mode: 'offer',
        amount: amount.toFixed(2),
      };
      if (ids.length > 0) {
        params.bundle_ids = serializeBundleIds(ids);
      }
      router.push({
        pathname: '/conversation/new',
        params,
      } as any);
    },
    [user, listing, selectedBundleIds, guestGate, toast, onOpenOfferSheet],
  );

  return {
    selectedBundleIds,
    setSelectedBundleIds,
    relatedTab,
    setRelatedTab,
    handleToggleBundleItem,
    handleSelectAllBundle,
    handleClearAllBundle,
    handleBuyBundle,
    handleSendBundleOffer,
  };
}
