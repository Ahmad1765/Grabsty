import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Pressable,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Modal,
  StyleSheet,
  ScrollView,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { KeyboardAvoider } from '@/components/ui/SafeContainer';
import { Text, TextInput } from '@/lib/rnText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Redirect } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import * as Clipboard from 'expo-clipboard';
import { tap } from '@/lib/haptics';
import { type as typography } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { safeBack } from '@/lib/nav';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { formatPrice } from '@/lib/fees';
import { supabase } from '@/lib/supabase';
import { cardImageUrl, IMAGE_TRANSITION } from '@/lib/images';
import {
  escrowService,
  getEscrowStatusStyle,
  canAdvanceEscrow,
  type EscrowLogisticsItem,
} from '@/lib/escrowService';
import type { EscrowStatus, TransactionEventLog } from '@/types';

type FilterTab =
  | 'active'
  | 'ready_for_pickup'
  | 'in_transit'
  | 'delivered'
  | 'completed'
  | 'disputed'
  | 'cancelled'
  | 'all';

const COURIER_PRESETS = ['Internal Fleet', 'TCS', 'Leopards', 'Trax', 'PostEx', 'M&P', 'Custom'];

function deriveRef(id: string): string {
  const hex = id.replace(/-/g, '').slice(0, 8);
  return hex.toUpperCase();
}

function formatDate(isoString?: string | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoString;
  }
}

export default function AdminLogisticsScreen() {
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 1024;
  // The table only gets 58% of the width beside the detail panel; below ~720px
  // its six columns crush, so rows switch to a stacked card.
  const compactRows = (isLargeScreen ? width * 0.58 : width) < 720;
  const { profile, loading: authLoading } = useAuth();
  const toast = useToast();

  const [activeFilter, setActiveFilter] = useState<FilterTab>('ready_for_pickup');
  const [searchQuery, setSearchQuery] = useState('');
  const [transactions, setTransactions] = useState<EscrowLogisticsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Selected Transaction for Detail View
  const [selectedTx, setSelectedTx] = useState<EscrowLogisticsItem | null>(null);
  const [eventLogs, setEventLogs] = useState<TransactionEventLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Action Modals
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Form Fields
  const [courier, setCourier] = useState(COURIER_PRESETS[0]);
  const [customCourier, setCustomCourier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [actionNotes, setActionNotes] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  // Fetch Transactions
  const loadTransactions = useCallback(async () => {
    try {
      const data = await escrowService.fetchLogisticsTransactions(activeFilter, 100);
      setTransactions(data);
      // Auto-select first item on large screen if nothing selected
      if (isLargeScreen && data.length > 0) {
        setSelectedTx((curr) => {
          if (!curr) return data[0];
          const found = data.find((t) => t.id === curr.id);
          return found || data[0];
        });
      }
    } catch (err: any) {
      toast.show(err?.message || 'Failed to load escrow transactions', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFilter, isLargeScreen, toast]);

  const loadTransactionsRef = useRef(loadTransactions);
  loadTransactionsRef.current = loadTransactions;

  useEffect(() => {
    if (!profile?.is_admin) return;
    setLoading(true);
    loadTransactions();
  }, [loadTransactions, profile?.is_admin]);

  // Load audit logs when selectedTx changes
  useEffect(() => {
    if (!selectedTx?.id) {
      setEventLogs([]);
      return;
    }
    let isCurrent = true;
    setLoadingLogs(true);
    escrowService
      .fetchEventLogs(selectedTx.id)
      .then((logs) => {
        if (isCurrent) setEventLogs(logs);
      })
      .finally(() => {
        if (isCurrent) setLoadingLogs(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedTx?.id]);

  // Supabase Real-time Subscriptions (Dual subscription on transactions and orders)
  useEffect(() => {
    if (!profile?.is_admin) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channelName = `admin_escrow_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            loadTransactionsRef.current();
          }, 300);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            loadTransactionsRef.current();
          }, 300);
        },
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [profile?.is_admin]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTransactions();
  }, [loadTransactions]);

  // Copy helper
  const copyToClipboard = async (text: string, label: string) => {
    tap('light');
    await Clipboard.setStringAsync(text);
    toast.show(`${label} copied!`, { variant: 'default', icon: 'check' });
  };

  // Dial Phone
  const handleCall = (phoneNumber?: string | null) => {
    if (!phoneNumber) {
      toast.show('No phone number provided', { variant: 'default', icon: 'alert-triangle' });
      return;
    }
    tap('light');
    Linking.openURL(`tel:${phoneNumber}`).catch(() => {
      toast.show('Could not open phone dialer', { variant: 'default', icon: 'alert-triangle' });
    });
  };

  // State Transition Handlers
  const handleAdvanceStatus = async (
    targetStatus: EscrowStatus,
    extra: {
      notes?: string;
      courier?: string;
      trackingNumber?: string;
      disputeReason?: string;
      cancelReason?: string;
    } = {},
  ) => {
    if (!selectedTx?.order_id) return;

    if (!canAdvanceEscrow(selectedTx.status, targetStatus)) {
      toast.show(`Cannot transition directly from ${selectedTx.status} to ${targetStatus}`, {
        variant: 'default',
        icon: 'alert-triangle',
      });
      return;
    }

    tap('medium');
    setSubmittingAction(true);

    try {
      const updated = await escrowService.advanceStatus({
        orderId: selectedTx.order_id,
        targetStatus,
        notes: extra.notes || null,
        courier: extra.courier || null,
        trackingNumber: extra.trackingNumber || null,
        disputeReason: extra.disputeReason || null,
        cancelReason: extra.cancelReason || null,
      });

      const updatedItem: EscrowLogisticsItem = {
        ...selectedTx,
        ...updated,
        order: selectedTx.order,
      };

      setTransactions((prev) =>
        prev.map((t) => (t.id === updated.id ? updatedItem : t)),
      );
      setSelectedTx(updatedItem);

      // Re-fetch event logs
      escrowService.fetchEventLogs(updated.id).then(setEventLogs);

      toast.show(`Status updated to ${getEscrowStatusStyle(targetStatus).label}`, {
        variant: 'default',
        icon: 'check',
      });

      setShowDispatchModal(false);
      setShowDisputeModal(false);
      setShowCancelModal(false);
      setActionNotes('');
      setTrackingNumber('');
      setDisputeReason('');
      setCancelReason('');
    } catch (err: any) {
      toast.show(err?.message || 'Failed to update transaction state', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleConfirmDispatch = async () => {
    const finalCourier = courier === 'Custom' ? customCourier.trim() : courier;
    await handleAdvanceStatus('IN_TRANSIT', {
      courier: finalCourier || 'Internal Logistics',
      trackingNumber: trackingNumber.trim() || undefined,
      notes: actionNotes.trim() || undefined,
    });
  };

  const handleConfirmDispute = async () => {
    if (!disputeReason.trim()) {
      toast.show('Please provide a reason for the dispute', {
        variant: 'default',
        icon: 'alert-triangle',
      });
      return;
    }
    await handleAdvanceStatus('DISPUTED', {
      disputeReason: disputeReason.trim(),
      notes: actionNotes.trim() || undefined,
    });
  };

  const handleConfirmCancel = async () => {
    if (!cancelReason.trim()) {
      toast.show('Please provide a cancellation reason', {
        variant: 'default',
        icon: 'alert-triangle',
      });
      return;
    }
    await handleAdvanceStatus('CANCELLED', {
      cancelReason: cancelReason.trim(),
      notes: actionNotes.trim() || undefined,
    });
  };

  // Filtered List
  const filteredTransactions = useMemo(() => {
    let list = transactions;

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter((t) => {
      const ref = deriveRef(t.id).toLowerCase();
      const orderRef = deriveRef(t.order_id).toLowerCase();
      const title = t.listing?.title?.toLowerCase() || '';
      const buyerName = (t.buyer?.full_name || t.buyer?.username || '').toLowerCase();
      const sellerName = (t.seller?.full_name || t.seller?.username || '').toLowerCase();
      const tracking = (t.tracking_number || '').toLowerCase();
      const courierName = (t.courier_name || '').toLowerCase();
      return (
        ref.includes(q) ||
        orderRef.includes(q) ||
        title.includes(q) ||
        buyerName.includes(q) ||
        sellerName.includes(q) ||
        tracking.includes(q) ||
        courierName.includes(q)
      );
    });
  }, [transactions, searchQuery]);

  // Auth Protection
  if (authLoading) {
    return (
      <SafeAreaView style={styles.authContainer} edges={['top']}>
        <ActivityIndicator color="#6C47FF" />
      </SafeAreaView>
    );
  }

  if (!profile?.is_admin) {
    return <Redirect href="/" />;
  }

  const filterTabs: { id: FilterTab; label: string; count?: number }[] = [
    { id: 'ready_for_pickup', label: 'Needs pickup' },
    { id: 'in_transit', label: 'In transit' },
    { id: 'delivered', label: 'Delivered' },
    { id: 'disputed', label: 'Disputed' },
    { id: 'all', label: 'All' },
  ];

  // Helper to extract seller pickup address
  const getPickupAddress = (item: EscrowLogisticsItem) => {
    const raw = item.order?.order_seller_pickups;
    if (Array.isArray(raw) && raw.length > 0) return raw[0]?.pickup_address;
    if (raw && typeof raw === 'object' && 'pickup_address' in raw) {
      return (raw as any).pickup_address;
    }
    return null;
  };

  const currentPickupAddress = selectedTx ? getPickupAddress(selectedTx) : null;
  const currentDropoffAddress = selectedTx?.order?.shipping_address;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* ── Top Header Bar ── */}
      <View style={styles.header}>
        <View style={[styles.headerLeft, { flex: 1, marginRight: 12 }]}>
          <Pressable
            onPress={() => safeBack()}
            hitSlop={HIT_SLOP_8}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressedOpacity]}
          >
            <Feather name="arrow-left" size={18} color="#FFFFFF" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Logistics</Text>
          </View>
        </View>

        <Pressable
          onPress={onRefresh}
          style={({ pressed }) => [styles.refreshButton, pressed && styles.pressedOpacity]}
        >
          <Feather name="rotate-cw" size={14} color="#A78BFA" />
          <Text style={styles.refreshButtonText}>Refresh</Text>
        </Pressable>
      </View>

      {/* ── Main Container (Split-View or Full-Width) ── */}
      <View style={[styles.mainLayout, isLargeScreen && styles.mainLayoutSplit]}>
        {/* ── Left Column: Table & Filters ── */}
        <View style={[styles.leftColumn, isLargeScreen && styles.leftColumnSplit]}>
          {/* ── Search & Filter Tabs ── */}
          <View style={styles.toolbar}>
            <View style={styles.searchBar}>
              <Feather name="search" size={15} color="#9CA3AF" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search orders"
                placeholderTextColor="#6B7280"
                style={styles.searchInput}
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={HIT_SLOP_8}>
                  <Feather name="x" size={15} color="#9CA3AF" />
                </Pressable>
              )}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0 }}
              contentContainerStyle={styles.tabsScroll}
            >
              {filterTabs.map((tab) => {
                const isActive = activeFilter === tab.id;
                return (
                  <Pressable
                    key={tab.id}
                    onPress={() => {
                      tap('light');
                      setActiveFilter(tab.id);
                    }}
                    style={[styles.tabPill, isActive && styles.tabPillActive]}
                  >
                    <Text style={[styles.tabPillText, isActive && styles.tabPillTextActive]}>
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* ── Orders Table Header ── */}
          {!compactRows && (
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderCell, { width: 90 }]}>REF ID</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1.6 }]}>ITEM / LISTING</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1.2 }]}>PICKUP (SELLER)</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1.2 }]}>DROPOFF (BUYER)</Text>
            <Text style={[styles.tableHeaderCell, { width: 105, textAlign: 'right' }]}>ESCROW</Text>
            <Text style={[styles.tableHeaderCell, { width: 135, textAlign: 'center' }]}>STATUS</Text>
          </View>
          )}

          {/* ── Orders Table List ── */}
          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator color="#6C47FF" size="large" />
              <Text style={styles.loadingText}>Syncing escrow ledger...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredTransactions}
              keyExtractor={(item) => item.id}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6C47FF" />
              }
              contentContainerStyle={
                filteredTransactions.length === 0 ? styles.emptyContainer : styles.listContent
              }
              ListEmptyComponent={
                <View style={styles.emptyCard}>
                  <Feather name="inbox" size={32} color="#4B5563" />
                  <Text style={styles.emptyTitle}>No matching transactions found</Text>
                  <Text style={styles.emptySubtitle}>
                    {searchQuery
                      ? 'Try adjusting your search criteria'
                      : 'Orders in this status will automatically appear here via realtime stream.'}
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const isSelected = selectedTx?.id === item.id;
                const statusStyle = getEscrowStatusStyle(item.status);
                const sellerPickup = getPickupAddress(item);
                const sellerCity = sellerPickup?.city || '—';
                const buyerCity = item.order?.shipping_address?.city || '—';
                const sellerName = item.seller?.full_name || item.seller?.username || 'Seller';
                const buyerName = item.buyer?.full_name || item.buyer?.username || 'Buyer';
                const img = item.listing ? cardImageUrl(item.listing, 0) : null;
                const thumb = img ? (
                  <Image source={{ uri: img }} style={styles.thumbnail} transition={IMAGE_TRANSITION} />
                ) : (
                  <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
                    <Feather name="image" size={14} color="#6B7280" />
                  </View>
                );
                const onSelect = () => {
                  tap('light');
                  setSelectedTx(item);
                };
                const statusBadge = (
                  <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                    <View style={[styles.statusBadgeDot, { backgroundColor: statusStyle.dotColor }]} />
                    <Text style={[styles.statusBadgeText, { color: statusStyle.color }]} numberOfLines={1}>
                      {statusStyle.label}
                    </Text>
                  </View>
                );

                if (compactRows) {
                  return (
                    <Pressable
                      onPress={onSelect}
                      style={({ pressed }) => [
                        styles.tableRow,
                        isSelected && styles.tableRowSelected,
                        pressed && styles.tableRowPressed,
                      ]}
                    >
                      {thumb}
                      <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
                        <Text style={styles.listingTitleText} numberOfLines={1}>
                          {item.listing?.title || 'Marketplace Item'}
                        </Text>
                        <Text style={styles.timeText} numberOfLines={1}>
                          {deriveRef(item.id)} · {formatDate(item.created_at)}
                        </Text>
                        <Text style={styles.cityText} numberOfLines={1}>
                          {sellerCity} → {buyerCity}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 6, marginLeft: 10 }}>
                        <Text style={styles.escrowAmountText}>{formatPrice(item.amount_cents / 100)}</Text>
                        {statusBadge}
                      </View>
                    </Pressable>
                  );
                }

                return (
                  <Pressable
                    onPress={onSelect}
                    style={({ pressed }) => [
                      styles.tableRow,
                      isSelected && styles.tableRowSelected,
                      pressed && styles.tableRowPressed,
                    ]}
                  >
                    {/* Ref ID */}
                    <View style={{ width: 90 }}>
                      <Text style={styles.refIdText}>{deriveRef(item.id)}</Text>
                      <Text style={styles.timeText}>{formatDate(item.created_at)}</Text>
                    </View>

                    {/* Listing & Thumbnail */}
                    <View style={[styles.listingCell, { flex: 1.6 }]}>
                      {thumb}
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.listingTitleText} numberOfLines={1}>
                          {item.listing?.title || 'Marketplace Item'}
                        </Text>
                        <Text style={styles.listingPriceText}>
                          {formatPrice(item.amount_cents / 100)}
                        </Text>
                      </View>
                    </View>

                    {/* Seller Pickup */}
                    <View style={{ flex: 1.2 }}>
                      <Text style={styles.personNameText} numberOfLines={1}>
                        {sellerName}
                      </Text>
                      <Text style={styles.cityText} numberOfLines={1}>
                        {sellerCity}
                      </Text>
                    </View>

                    {/* Buyer Dropoff */}
                    <View style={{ flex: 1.2 }}>
                      <Text style={styles.personNameText} numberOfLines={1}>
                        {buyerName}
                      </Text>
                      <Text style={styles.cityText} numberOfLines={1}>
                        {buyerCity}
                      </Text>
                    </View>

                    {/* Escrow Gross Amount */}
                    <View style={{ width: 105, alignItems: 'flex-end' }}>
                      <Text style={styles.escrowAmountText}>
                        {formatPrice(item.amount_cents / 100)}
                      </Text>
                      <Text style={styles.escrowSubText}>
                        {item.payment_method?.toUpperCase()}
                      </Text>
                    </View>

                    {/* Status Badge */}
                    <View style={{ width: 135, alignItems: 'center' }}>{statusBadge}</View>
                  </Pressable>
                );
              }}
            />
          )}
        </View>

        {/* ── Right Column: Detail View (Split-Screen on Desktop, Modal on Mobile) ── */}
        {isLargeScreen ? (
          <View style={styles.rightColumnSplit}>
            {selectedTx ? (
              <ScrollView
                style={styles.detailScroll}
                contentContainerStyle={styles.detailScrollContent}
              >
                <DetailContent
                  tx={selectedTx}
                  pickupAddress={currentPickupAddress}
                  dropoffAddress={currentDropoffAddress}
                  eventLogs={eventLogs}
                  loadingLogs={loadingLogs}
                  onOpenDispatch={() => setShowDispatchModal(true)}
                  onOpenDispute={() => setShowDisputeModal(true)}
                  onOpenCancel={() => setShowCancelModal(true)}
                  onAdvance={handleAdvanceStatus}
                  onCopy={copyToClipboard}
                  onCall={handleCall}
                  submitting={submittingAction}
                />
              </ScrollView>
            ) : (
              <View style={styles.noSelectionCard}>
                <Feather name="mouse-pointer" size={32} color="#4B5563" />
                <Text style={styles.noSelectionTitle}>Select an order to inspect logistics</Text>
                <Text style={styles.noSelectionSubtitle}>
                  View pickup, drop-off, accounting ledger, and advance the escrow state machine.
                </Text>
              </View>
            )}
          </View>
        ) : (
          /* Mobile Drawer / Modal */
          <Modal
            visible={Boolean(selectedTx && !isLargeScreen)}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setSelectedTx(null)}
          >
            <View style={styles.mobileModalRoot}>
              <View style={styles.mobileModalHeader}>
                <Text style={styles.mobileModalTitle}>Logistics Detail</Text>
                <Pressable onPress={() => setSelectedTx(null)} hitSlop={HIT_SLOP_8}>
                  <Feather name="x" size={20} color="#FFFFFF" />
                </Pressable>
              </View>
              {selectedTx && (
                <ScrollView
                  style={styles.detailScroll}
                  contentContainerStyle={styles.detailScrollContent}
                >
                  <DetailContent
                    tx={selectedTx}
                    pickupAddress={currentPickupAddress}
                    dropoffAddress={currentDropoffAddress}
                    eventLogs={eventLogs}
                    loadingLogs={loadingLogs}
                    onOpenDispatch={() => setShowDispatchModal(true)}
                    onOpenDispute={() => setShowDisputeModal(true)}
                    onOpenCancel={() => setShowCancelModal(true)}
                    onAdvance={handleAdvanceStatus}
                    onCopy={copyToClipboard}
                    onCall={handleCall}
                    submitting={submittingAction}
                  />
                </ScrollView>
              )}
            </View>
          </Modal>
        )}
      </View>

      {/* ── Modal: Mark Picked Up & In Transit ── */}
      <Modal
        visible={showDispatchModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDispatchModal(false)}
      >
        <KeyboardAvoider
          style={styles.modalOverlay}
        >
          <View style={styles.modalDialog}>
            <View style={styles.modalDialogHeader}>
              <View>
                <Text style={styles.modalDialogTitle}>Dispatch Shipment</Text>
                <Text style={styles.modalDialogSubtitle}>
                  Advance order from Ready for Pickup to In Transit
                </Text>
              </View>
              <Pressable onPress={() => setShowDispatchModal(false)} hitSlop={HIT_SLOP_8}>
                <Feather name="x" size={18} color="#9CA3AF" />
              </Pressable>
            </View>

            {/* Courier Selection */}
            <Text style={styles.fieldLabel}>ASSIGNED COURIER / FLEET</Text>
            <View style={styles.courierRow}>
              {COURIER_PRESETS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCourier(c)}
                  style={[styles.courierChip, courier === c && styles.courierChipActive]}
                >
                  <Text
                    style={[
                      styles.courierChipText,
                      courier === c && styles.courierChipTextActive,
                    ]}
                  >
                    {c}
                  </Text>
                </Pressable>
              ))}
            </View>

            {courier === 'Custom' && (
              <TextInput
                value={customCourier}
                onChangeText={setCustomCourier}
                placeholder="Enter custom courier name"
                placeholderTextColor="#6B7280"
                style={styles.dialogInput}
              />
            )}

            {/* Consignment Tracking # */}
            <Text style={styles.fieldLabel}>CONSIGNMENT / TRACKING # (OPTIONAL)</Text>
            <TextInput
              value={trackingNumber}
              onChangeText={setTrackingNumber}
              placeholder="e.g. TRK-88329104"
              placeholderTextColor="#6B7280"
              style={styles.dialogInput}
            />

            {/* Operational Notes */}
            <Text style={styles.fieldLabel}>LOGISTICS HANDOFF NOTES</Text>
            <TextInput
              value={actionNotes}
              onChangeText={setActionNotes}
              placeholder="e.g. Picked up from seller, package sealed with tamper tape."
              placeholderTextColor="#6B7280"
              style={[styles.dialogInput, { height: 60 }]}
              multiline
            />

            <View style={styles.modalActionsRow}>
              <Pressable
                onPress={() => setShowDispatchModal(false)}
                style={styles.modalCancelButton}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={handleConfirmDispatch}
                disabled={submittingAction}
                style={[styles.modalSubmitButton, submittingAction && styles.disabledButton]}
              >
                {submittingAction ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Confirm In Transit</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoider>
      </Modal>

      {/* ── Modal: Flag Dispute ── */}
      <Modal
        visible={showDisputeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDisputeModal(false)}
      >
        <KeyboardAvoider
          style={styles.modalOverlay}
        >
          <View style={styles.modalDialog}>
            <View style={styles.modalDialogHeader}>
              <View>
                <Text style={[styles.modalDialogTitle, { color: '#EF4444' }]}>
                  Flag Order Dispute
                </Text>
                <Text style={styles.modalDialogSubtitle}>
                  Freezes escrow release pending administrative review.
                </Text>
              </View>
              <Pressable onPress={() => setShowDisputeModal(false)} hitSlop={HIT_SLOP_8}>
                <Feather name="x" size={18} color="#9CA3AF" />
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>REASON FOR DISPUTE (REQUIRED)</Text>
            <TextInput
              value={disputeReason}
              onChangeText={setDisputeReason}
              placeholder="e.g. Package damaged in transit, item condition mismatched."
              placeholderTextColor="#6B7280"
              style={[styles.dialogInput, { height: 80 }]}
              multiline
            />

            <View style={styles.modalActionsRow}>
              <Pressable
                onPress={() => setShowDisputeModal(false)}
                style={styles.modalCancelButton}
              >
                <Text style={styles.modalCancelText}>Dismiss</Text>
              </Pressable>

              <Pressable
                onPress={handleConfirmDispute}
                disabled={submittingAction}
                style={[
                  styles.modalSubmitButton,
                  { backgroundColor: '#EF4444' },
                  submittingAction && styles.disabledButton,
                ]}
              >
                {submittingAction ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Freeze Escrow & Flag</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoider>
      </Modal>

      {/* ── Modal: Cancel & Refund ── */}
      <Modal
        visible={showCancelModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCancelModal(false)}
      >
        <KeyboardAvoider
          style={styles.modalOverlay}
        >
          <View style={styles.modalDialog}>
            <View style={styles.modalDialogHeader}>
              <View>
                <Text style={[styles.modalDialogTitle, { color: '#9CA3AF' }]}>
                  Cancel Transaction
                </Text>
                <Text style={styles.modalDialogSubtitle}>
                  Refunds escrow payment to buyer and terminates order.
                </Text>
              </View>
              <Pressable onPress={() => setShowCancelModal(false)} hitSlop={HIT_SLOP_8}>
                <Feather name="x" size={18} color="#9CA3AF" />
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>CANCELLATION REASON (REQUIRED)</Text>
            <TextInput
              value={cancelReason}
              onChangeText={setCancelReason}
              placeholder="e.g. Seller unresponsive, buyer requested cancellation before pickup."
              placeholderTextColor="#6B7280"
              style={[styles.dialogInput, { height: 80 }]}
              multiline
            />

            <View style={styles.modalActionsRow}>
              <Pressable
                onPress={() => setShowCancelModal(false)}
                style={styles.modalCancelButton}
              >
                <Text style={styles.modalCancelText}>Dismiss</Text>
              </Pressable>

              <Pressable
                onPress={handleConfirmCancel}
                disabled={submittingAction}
                style={[
                  styles.modalSubmitButton,
                  { backgroundColor: '#374151' },
                  submittingAction && styles.disabledButton,
                ]}
              >
                {submittingAction ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Confirm Cancellation</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoider>
      </Modal>
    </SafeAreaView>
  );
}

// ── Detail View Component ──────────────────────────────────────────────────
function DetailContent({
  tx,
  pickupAddress,
  dropoffAddress,
  eventLogs,
  loadingLogs,
  onOpenDispatch,
  onOpenDispute,
  onOpenCancel,
  onAdvance,
  onCopy,
  onCall,
  submitting,
}: {
  tx: EscrowLogisticsItem;
  pickupAddress: any;
  dropoffAddress: any;
  eventLogs: TransactionEventLog[];
  loadingLogs: boolean;
  onOpenDispatch: () => void;
  onOpenDispute: () => void;
  onOpenCancel: () => void;
  onAdvance: (target: EscrowStatus) => void;
  onCopy: (text: string, label: string) => void;
  onCall: (phone?: string | null) => void;
  submitting: boolean;
}) {
  const statusStyle = getEscrowStatusStyle(tx.status);
  const sellerPhone = pickupAddress?.phone || (tx.seller as any)?.phone || null;
  const buyerPhone = dropoffAddress?.phone || (tx.buyer as any)?.phone || null;
  const itemImg = tx.listing ? cardImageUrl(tx.listing, 0) : null;
  const [showHistory, setShowHistory] = useState(false);

  return (
    <View style={styles.detailContainer}>
      {/* ── Top Header ── */}
      <View style={styles.detailHeader}>
        <View>
          <View style={styles.refRow}>
            <Text style={styles.detailRefId}>#{deriveRef(tx.id)}</Text>
            <Pressable
              onPress={() => onCopy(deriveRef(tx.id), 'Reference ID')}
              style={styles.copySmallBtn}
            >
              <Feather name="copy" size={12} color="#9CA3AF" />
            </Pressable>
          </View>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
          <View style={[styles.statusBadgeDot, { backgroundColor: statusStyle.dotColor }]} />
          <Text style={[styles.statusBadgeText, { color: statusStyle.color }]}>
            {statusStyle.label}
          </Text>
        </View>
      </View>

      {/* ── Action Controls Bar ── */}
      <View style={styles.actionSection}>
        <View style={styles.actionButtonsContainer}>
          {tx.status === 'READY_FOR_PICKUP' && (
            <Pressable
              onPress={onOpenDispatch}
              disabled={submitting}
              style={[styles.primaryActionButton, submitting && styles.disabledButton]}
            >
              <Feather name="truck" size={15} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.primaryActionText}>Mark picked up</Text>
            </Pressable>
          )}

          {tx.status === 'IN_TRANSIT' && (
            <Pressable
              onPress={() => onAdvance('DELIVERED')}
              disabled={submitting}
              style={[
                styles.primaryActionButton,
                { backgroundColor: '#059669' },
                submitting && styles.disabledButton,
              ]}
            >
              <Feather name="check-circle" size={15} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.primaryActionText}>Mark delivered</Text>
            </Pressable>
          )}

          {(tx.status === 'DELIVERED' || tx.status === 'DISPUTED') && (
            <Pressable
              onPress={() => onAdvance('COMPLETED_FUNDS_RELEASED')}
              disabled={submitting}
              style={[
                styles.primaryActionButton,
                { backgroundColor: '#6C47FF' },
                submitting && styles.disabledButton,
              ]}
            >
              <Feather name="unlock" size={15} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.primaryActionText}>Release payment to seller</Text>
            </Pressable>
          )}

          {/* Secondary Actions */}
          <View style={styles.secondaryActionsRow}>
            {canAdvanceEscrow(tx.status, 'DISPUTED') && (
              <Pressable
                onPress={onOpenDispute}
                style={({ pressed }) => [styles.dangerActionBtn, pressed && styles.pressedOpacity]}
              >
                <Feather name="alert-triangle" size={13} color="#EF4444" style={{ marginRight: 6 }} />
                <Text style={styles.dangerActionText}>Open dispute</Text>
              </Pressable>
            )}

            {canAdvanceEscrow(tx.status, 'CANCELLED') && (
              <Pressable
                onPress={onOpenCancel}
                style={({ pressed }) => [styles.neutralActionBtn, pressed && styles.pressedOpacity]}
              >
                <Feather name="x" size={13} color="#9CA3AF" style={{ marginRight: 6 }} />
                <Text style={styles.neutralActionText}>Cancel & Refund</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {/* ── Listing & Package Specs ── */}
      <View style={styles.itemCard}>
        <View style={styles.itemCardContent}>
          {itemImg ? (
            <Image source={{ uri: itemImg }} style={styles.itemImage} transition={IMAGE_TRANSITION} />
          ) : (
            <View style={[styles.itemImage, styles.thumbnailPlaceholder]}>
              <Feather name="image" size={18} color="#6B7280" />
            </View>
          )}
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.itemTitle} numberOfLines={2}>
              {tx.listing?.title || 'Marketplace Item'}
            </Text>
            {tx.listing?.brand || tx.listing?.category ? (
              <Text style={styles.cityText} numberOfLines={1}>
                {[tx.listing?.brand, tx.listing?.category].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
            <Text style={styles.itemPrice}>{formatPrice(tx.amount_cents / 100)}</Text>
          </View>
        </View>
      </View>

      {/* ── Two-Column Card: Pickup & Dropoff ── */}
      <View style={styles.cardsRow}>
        {/* Pickup Details (Seller) */}
        <View style={styles.infoCard}>
          <View style={styles.infoCardHeader}>
            <View style={styles.infoBadgePickup}>
              <Feather name="arrow-up-right" size={12} color="#FBBF24" />
              <Text style={styles.infoBadgePickupText}>Pick up from</Text>
            </View>
            {sellerPhone && (
              <View style={styles.contactActions}>
                <Pressable onPress={() => onCall(sellerPhone)} style={styles.contactIconBtn}>
                  <Feather name="phone" size={13} color="#A78BFA" />
                </Pressable>
                <Pressable
                  onPress={() => onCopy(sellerPhone, 'Seller phone')}
                  style={styles.contactIconBtn}
                >
                  <Feather name="copy" size={13} color="#9CA3AF" />
                </Pressable>
              </View>
            )}
          </View>

          <Text style={styles.cardPersonName}>
            {tx.seller?.full_name || tx.seller?.username || 'Seller'}
          </Text>
          <Text style={styles.cardPhoneText}>{sellerPhone || 'No phone registered'}</Text>

          <View style={styles.addressBlock}>
            {pickupAddress ? (
              <>
                <Text style={styles.addressLine}>{pickupAddress.line1}</Text>
                {pickupAddress.line2 ? (
                  <Text style={styles.addressLine}>{pickupAddress.line2}</Text>
                ) : null}
                <Text style={styles.addressCity}>
                  {pickupAddress.city}
                  {pickupAddress.postalCode ? `, ${pickupAddress.postalCode}` : ''}
                </Text>
              </>
            ) : (
              <Text style={styles.addressLineMuted}>Seller has not submitted pickup address yet.</Text>
            )}
          </View>
        </View>

        {/* Drop-off Details (Buyer) */}
        <View style={styles.infoCard}>
          <View style={styles.infoCardHeader}>
            <View style={styles.infoBadgeDropoff}>
              <Feather name="arrow-down-left" size={12} color="#34D399" />
              <Text style={styles.infoBadgeDropoffText}>Deliver to</Text>
            </View>
            {buyerPhone && (
              <View style={styles.contactActions}>
                <Pressable onPress={() => onCall(buyerPhone)} style={styles.contactIconBtn}>
                  <Feather name="phone" size={13} color="#34D399" />
                </Pressable>
                <Pressable
                  onPress={() => onCopy(buyerPhone, 'Buyer phone')}
                  style={styles.contactIconBtn}
                >
                  <Feather name="copy" size={13} color="#9CA3AF" />
                </Pressable>
              </View>
            )}
          </View>

          <Text style={styles.cardPersonName}>
            {tx.buyer?.full_name || tx.buyer?.username || 'Buyer'}
          </Text>
          <Text style={styles.cardPhoneText}>{buyerPhone || 'No phone registered'}</Text>

          <View style={styles.addressBlock}>
            {dropoffAddress ? (
              <>
                <Text style={styles.addressLine}>{dropoffAddress.line1}</Text>
                {dropoffAddress.line2 ? (
                  <Text style={styles.addressLine}>{dropoffAddress.line2}</Text>
                ) : null}
                <Text style={styles.addressCity}>
                  {dropoffAddress.city}
                  {dropoffAddress.postalCode ? `, ${dropoffAddress.postalCode}` : ''}
                </Text>
                {dropoffAddress.deliveryInstructions ? (
                  <View style={styles.instructionsCallout}>
                    <Text style={styles.instructionsText}>
                      Note: {dropoffAddress.deliveryInstructions}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : (
              <Text style={styles.addressLineMuted}>No delivery address recorded.</Text>
            )}
          </View>
        </View>
      </View>

      {/* ── Financial Escrow Ledger Card (Invariant Check) ── */}
      <View style={styles.ledgerCard}>
        <Text style={styles.sectionHeaderTitle}>PAYMENT</Text>
        <View style={styles.ledgerRow}>
          <Text style={styles.ledgerLabel}>Buyer pays</Text>
          <Text style={styles.ledgerValue}>{formatPrice(tx.amount_cents / 100)}</Text>
        </View>
        <View style={styles.ledgerRow}>
          <Text style={styles.ledgerLabel}>Delivery</Text>
          <Text style={styles.ledgerValueSub}>- {formatPrice(tx.shipping_fee_cents / 100)}</Text>
        </View>
        <View style={styles.ledgerRow}>
          <Text style={styles.ledgerLabel}>Buyer Protection</Text>
          <Text style={styles.ledgerValueSub}>- {formatPrice(tx.platform_fee_cents / 100)}</Text>
        </View>
        <View style={styles.ledgerDivider} />
        <View style={styles.ledgerRow}>
          <Text style={styles.ledgerPayoutLabel}>Seller receives</Text>
          <Text style={styles.ledgerPayoutValue}>
            {formatPrice(tx.payout_amount_cents / 100)}
          </Text>
        </View>
      </View>

      {/* ── Audit Trail & Timestamps ── */}
      <View style={styles.auditSection}>
        <Pressable onPress={() => setShowHistory((v) => !v)} hitSlop={HIT_SLOP_8}>
          <Text style={styles.sectionHeaderTitle}>
            {showHistory ? 'HIDE HISTORY' : `SHOW HISTORY${eventLogs.length ? ` (${eventLogs.length})` : ''}`}
          </Text>
        </Pressable>
        {!showHistory ? null : loadingLogs ? (
          <ActivityIndicator color="#6C47FF" size="small" style={{ marginVertical: 12 }} />
        ) : eventLogs.length === 0 ? (
          <Text style={styles.noLogsText}>No history yet.</Text>
        ) : (
          <View style={styles.logsList}>
            {eventLogs.map((log, index) => (
              <View key={log.id} style={styles.logItem}>
                <View style={styles.logDot} />
                {index < eventLogs.length - 1 && <View style={styles.logLine} />}
                <View style={styles.logContent}>
                  <View style={styles.logHeaderRow}>
                    <Text style={styles.logAction}>{log.action}</Text>
                    <Text style={styles.logTime}>{formatDate(log.created_at)}</Text>
                  </View>
                  <Text style={styles.logTransition}>
                    {log.from_status ? `${log.from_status} ➔ ` : ''}
                    <Text style={{ color: '#A78BFA' }}>{log.to_status}</Text>
                  </Text>
                  {log.notes ? (
                    <Text style={styles.logNotes}>{`\u201C${log.notes}\u201D`}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

// ── Styles (High-end Apple/Linear/Stripe Dark Aesthetic) ──────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#090A0D',
  },
  authContainer: {
    flex: 1,
    backgroundColor: '#090A0D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: '#0E1015',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#161922',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: typography.family.sansBold,
    letterSpacing: -0.3,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  liveText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#34D399',
    fontFamily: typography.family.sansSemibold,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    fontFamily: typography.family.sans,
    marginTop: 2,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#181B23',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  refreshButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#A78BFA',
    fontFamily: typography.family.sansSemibold,
  },
  mainLayout: {
    flex: 1,
  },
  mainLayoutSplit: {
    flexDirection: 'row',
  },
  leftColumn: {
    flex: 1,
  },
  leftColumnSplit: {
    flex: 0.58,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.08)',
  },
  rightColumnSplit: {
    flex: 0.42,
    backgroundColor: '#0D0E13',
  },
  toolbar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12141B',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    height: 38,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#FFFFFF',
    fontFamily: typography.family.sans,
    marginLeft: 8,
  },
  tabsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 4,
  },
  tabPill: {
    paddingHorizontal: 14,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#141720',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabPillActive: {
    backgroundColor: '#6C47FF',
    borderColor: '#6C47FF',
  },
  tabPillText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9CA3AF',
    fontFamily: typography.family.sansMedium,
  },
  tabPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#0E1016',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    fontFamily: typography.family.sansBold,
    letterSpacing: 0.5,
  },
  listContent: {
    paddingBottom: 40,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: '#090A0D',
  },
  tableRowSelected: {
    backgroundColor: '#141722',
  },
  tableRowPressed: {
    backgroundColor: '#181C28',
  },
  refIdText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E5E7EB',
    fontFamily: typography.family.sansBold,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
  timeText: {
    fontSize: 10.5,
    color: '#6B7280',
    fontFamily: typography.family.sans,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  listingCell: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumbnail: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#1F2430',
  },
  thumbnailPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  listingTitleText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: typography.family.sansSemibold,
  },
  listingPriceText: {
    fontSize: 11.5,
    color: '#9CA3AF',
    fontFamily: typography.family.sans,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  personNameText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#E5E7EB',
    fontFamily: typography.family.sansMedium,
  },
  cityText: {
    fontSize: 11,
    color: '#6B7280',
    fontFamily: typography.family.sans,
    marginTop: 2,
  },
  escrowAmountText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: typography.family.sansBold,
    fontVariant: ['tabular-nums'],
  },
  escrowSubText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
    fontFamily: typography.family.sansSemibold,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: typography.family.sansSemibold,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 12,
    fontFamily: typography.family.sans,
  },
  emptyContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyCard: {
    alignItems: 'center',
    padding: 30,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E5E7EB',
    marginTop: 12,
    fontFamily: typography.family.sansSemibold,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 280,
    fontFamily: typography.family.sans,
  },
  noSelectionCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  noSelectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E5E7EB',
    marginTop: 14,
    fontFamily: typography.family.sansSemibold,
  },
  noSelectionSubtitle: {
    fontSize: 12.5,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 300,
    fontFamily: typography.family.sans,
  },
  detailScroll: {
    flex: 1,
  },
  detailScrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
  detailContainer: {
    gap: 16,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  refRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailRefId: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: typography.family.sansBold,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
  copySmallBtn: {
    padding: 4,
  },
  detailOrderIdText: {
    fontSize: 11,
    color: '#6B7280',
    fontFamily: typography.family.sans,
    fontVariant: ['tabular-nums'],
    marginTop: 3,
  },
  actionSection: {
    backgroundColor: '#12141B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 14,
  },
  sectionHeaderTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    fontFamily: typography.family.sansBold,
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  actionButtonsContainer: {
    gap: 10,
  },
  primaryActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: 8,
    backgroundColor: '#6C47FF',
    paddingHorizontal: 16,
  },
  primaryActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: typography.family.sansSemibold,
  },
  secondaryActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dangerActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 34,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  dangerActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
    fontFamily: typography.family.sansSemibold,
  },
  neutralActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 34,
    borderRadius: 8,
    backgroundColor: '#181B23',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  neutralActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
    fontFamily: typography.family.sansSemibold,
  },
  cardsRow: {
    gap: 12,
  },
  infoCard: {
    backgroundColor: '#12141B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 14,
  },
  infoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  infoBadgePickup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  infoBadgePickupText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#FBBF24',
    letterSpacing: 0.5,
  },
  infoBadgeDropoff: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  infoBadgeDropoffText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#34D399',
    letterSpacing: 0.5,
  },
  contactActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contactIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1A1D27',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardPersonName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: typography.family.sansSemibold,
  },
  cardPhoneText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontFamily: typography.family.sans,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  addressBlock: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  addressLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
    fontFamily: typography.family.sansBold,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  addressLine: {
    fontSize: 12.5,
    color: '#E5E7EB',
    fontFamily: typography.family.sans,
    lineHeight: 18,
  },
  addressLineMuted: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  addressCity: {
    fontSize: 12,
    fontWeight: '600',
    color: '#A78BFA',
    marginTop: 2,
    fontFamily: typography.family.sansSemibold,
  },
  instructionsCallout: {
    marginTop: 8,
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#191C27',
    borderLeftWidth: 2,
    borderLeftColor: '#34D399',
  },
  instructionsText: {
    fontSize: 11.5,
    color: '#D1D5DB',
    fontFamily: typography.family.sans,
  },
  itemCard: {
    backgroundColor: '#12141B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 12,
  },
  itemCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#1F2430',
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: typography.family.sansSemibold,
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  itemMetaTag: {
    fontSize: 11,
    color: '#9CA3AF',
    fontFamily: typography.family.sans,
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: typography.family.sansBold,
    fontVariant: ['tabular-nums'],
    marginTop: 4,
  },
  ledgerCard: {
    backgroundColor: '#12141B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 14,
  },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  ledgerLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    fontFamily: typography.family.sans,
  },
  ledgerValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: typography.family.sansSemibold,
    fontVariant: ['tabular-nums'],
  },
  ledgerValueSub: {
    fontSize: 12.5,
    color: '#F87171',
    fontFamily: typography.family.sans,
    fontVariant: ['tabular-nums'],
  },
  ledgerDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 8,
  },
  ledgerPayoutLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: typography.family.sansBold,
  },
  ledgerPayoutValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#34D399',
    fontFamily: typography.family.sansBold,
    fontVariant: ['tabular-nums'],
  },
  balanceCheckTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  balanceCheckText: {
    fontSize: 10.5,
    color: '#10B981',
    fontFamily: typography.family.sans,
    fontVariant: ['tabular-nums'],
  },
  auditSection: {
    backgroundColor: '#12141B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 14,
  },
  noLogsText: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
    paddingVertical: 6,
  },
  logsList: {
    paddingLeft: 6,
    paddingTop: 6,
  },
  logItem: {
    flexDirection: 'row',
    marginBottom: 14,
    position: 'relative',
  },
  logDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6C47FF',
    marginTop: 4,
    marginRight: 10,
  },
  logLine: {
    position: 'absolute',
    top: 14,
    left: 3.5,
    width: 1,
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  logContent: {
    flex: 1,
  },
  logHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logAction: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E5E7EB',
    fontFamily: typography.family.sansSemibold,
  },
  logTime: {
    fontSize: 10.5,
    color: '#6B7280',
    fontFamily: typography.family.sans,
    fontVariant: ['tabular-nums'],
  },
  logTransition: {
    fontSize: 11.5,
    color: '#9CA3AF',
    marginTop: 2,
    fontFamily: typography.family.sans,
  },
  logNotes: {
    fontSize: 11,
    color: '#D1D5DB',
    fontStyle: 'italic',
    marginTop: 2,
  },
  mobileModalRoot: {
    flex: 1,
    backgroundColor: '#090A0D',
  },
  mobileModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  mobileModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: typography.family.sansBold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalDialog: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#12141C',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: 20,
  },
  modalDialogHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalDialogTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: typography.family.sansBold,
  },
  modalDialogSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#9CA3AF',
    fontFamily: typography.family.sansBold,
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 10,
  },
  courierRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  courierChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#1A1D27',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  courierChipActive: {
    backgroundColor: '#6C47FF',
    borderColor: '#6C47FF',
  },
  courierChipText: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#9CA3AF',
  },
  courierChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  dialogInput: {
    backgroundColor: '#181C26',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#FFFFFF',
    fontFamily: typography.family.sans,
    marginBottom: 8,
  },
  modalActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
  },
  modalCancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#1C202C',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  modalSubmitButton: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#6C47FF',
  },
  modalSubmitText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  disabledButton: {
    opacity: 0.5,
  },
  pressedOpacity: {
    opacity: 0.7,
  },
});
