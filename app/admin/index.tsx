// ─────────────────────────────────────────────────────────────────────────────
// GRABSTY ADMINISTRATION CONSOLE (OFF-PLATFORM UNIFIED OPERATIONAL HUB)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 Architectural Blueprint:
// 1. Off-Platform Isolation:
//    Completely detached from consumer user settings and personal profiles.
//    Accessible directly via secure route (/admin) with strict admin authentication guards.
//
// 2. All-in-One Operations:
//    - Overview & Real-Time Platform Metrics
//    - Escrow & Logistics Management (Courier dispatch, tracking, status transitions)
//    - Dispute Resolution Workbench (Release escrow to seller or refund buyer)
//    - Seller Identity Verifications (KYC review, approve, reject)
//    - User Management
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Modal,
  Linking,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import { KeyboardAvoider } from '@/components/ui/SafeContainer';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useTheme } from '@/context/ThemeContext';
import { tap } from '@/lib/haptics';
import { formatPrice } from '@/lib/fees';
import { supabase } from '@/lib/supabase';
import { cardImageUrl, getOptimizedImageUrl, IMAGE_TRANSITION } from '@/lib/images';
import {
  escrowService,
  getEscrowStatusStyle,
  canAdvanceEscrow,
  type EscrowLogisticsItem,
} from '@/lib/escrowService';
import type { EscrowStatus, Verification, User } from '@/types';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import {
  fetchAdminSupportConversations,
  fetchAdminSupportMessages,
  adminSendSupportMessage,
  SUPPORT_BOT_USER_ID,
  type AdminSupportConversation,
} from '@/lib/support';
import type { ChatMessage } from '@/lib/chat';
import { useVerificationPhotoUrl } from '@/lib/upload';

type AdminTab = 'overview' | 'logistics' | 'disputes' | 'verifications' | 'users' | 'support';
type LogisticsFilter = 'all' | 'active' | 'IN_TRANSIT' | 'DELIVERED' | 'COMPLETED_FUNDS_RELEASED';

const COURIER_PRESETS = ['Internal Fleet', 'TCS', 'Leopards', 'Trax', 'PostEx', 'M&P', 'Custom'];

// ID photos are in a private bucket; this resolves the stored path to a signed URL.
function KycPhoto({ value, style }: { value: string; style: React.ComponentProps<typeof Image>['style'] }) {
  const uri = useVerificationPhotoUrl(value);
  return <Image source={uri ? { uri } : undefined} style={style} contentFit="cover" />;
}

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
    });
  } catch {
    return isoString;
  }
}

export default function AdminConsoleScreen() {
  const { profile, loading: authLoading, signOut } = useAuth();
  const { theme, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const toast = useToast();
  const isDesktop = width >= 960;

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Logistics & Escrow State
  const [transactions, setTransactions] = useState<EscrowLogisticsItem[]>([]);
  const [logisticsFilter, setLogisticsFilter] = useState<LogisticsFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTx, setSelectedTx] = useState<EscrowLogisticsItem | null>(null);

  // Dispatch / Action Modals
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [selectedCourier, setSelectedCourier] = useState(COURIER_PRESETS[0]);
  const [customCourier, setCustomCourier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [actionNotes, setActionNotes] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  // Dispute Resolution Modal
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeResolutionType, setDisputeResolutionType] = useState<'release_to_seller' | 'refund_buyer'>('release_to_seller');
  const [disputeNotes, setDisputeNotes] = useState('');

  // Verifications (KYC) State
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [verificationFilter, setVerificationFilter] = useState<'all' | 'submitted' | 'approved' | 'rejected'>('submitted');
  const [processingKycId, setProcessingKycId] = useState<string | null>(null);

  // Users Directory State
  const [users, setUsers] = useState<User[]>([]);
  const [userSearch, setUserSearch] = useState('');

  // Support Team State
  const [supportConvs, setSupportConvs] = useState<AdminSupportConversation[]>([]);
  const [supportFilter, setSupportFilter] = useState<'all' | 'disputes' | 'general'>('all');
  const [supportSearch, setSupportSearch] = useState('');
  const [selectedSupportConv, setSelectedSupportConv] = useState<AdminSupportConversation | null>(null);
  const [supportMessages, setSupportMessages] = useState<ChatMessage[]>([]);
  const [adminReplyText, setAdminReplyText] = useState('');
  const [sendingAdminReply, setSendingAdminReply] = useState(false);
  const [loadingSupportMessages, setLoadingSupportMessages] = useState(false);
  const selectedSupportConvRef = useRef<AdminSupportConversation | null>(null);
  selectedSupportConvRef.current = selectedSupportConv;
  const supportScrollRef = useRef<ScrollView>(null);
  const loadSupportMessagesRef = useRef<((convId: string) => Promise<void>) | null>(null);

  // ── Load All Operational Data ─────────────────────────────────────────────
  const loadAllData = useCallback(async () => {
    if (!profile?.is_admin) return;
    try {
      const [txs, kycRes, usersRes, supportConvsData] = await Promise.all([
        escrowService.fetchLogisticsTransactions('all', 100),
        supabase.rpc('admin_get_verifications', { p_status: 'all' }),
        supabase.rpc('admin_get_users', { p_limit: 100 }),
        fetchAdminSupportConversations('all'),
      ]);

      setTransactions(txs);
      if (kycRes.data) setVerifications(kycRes.data as Verification[]);
      if (usersRes.data) setUsers(usersRes.data as User[]);
      if (supportConvsData) {
        // A chat is a dispute when its user is party to a DISPUTED order. The old
        // signal (the word "dispute" in the latest message) vanished on any reply.
        const disputeUserIds = new Set<string>();
        for (const t of txs as any[]) {
          if (t.status !== 'DISPUTED') continue;
          for (const id of [t.buyer_id, t.buyer?.id, t.seller_id, t.seller?.id]) if (id) disputeUserIds.add(id);
        }
        setSupportConvs(
          supportConvsData.map((c) => ({ ...c, is_dispute: c.is_dispute || disputeUserIds.has(c.user_id) })),
        );
      }
    } catch (err: any) {
      toast.show(err?.message || 'Failed to load administrative data', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.is_admin, toast]);

  const loadDataRef = useRef(loadAllData);
  loadDataRef.current = loadAllData;

  useEffect(() => {
    if (profile?.is_admin) {
      setLoading(true);
      loadAllData();
    }
  }, [profile?.is_admin, loadAllData]);

  // Real-time PostgreSQL subscription for live updates
  useEffect(() => {
    if (!profile?.is_admin) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`admin_console_${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => loadDataRef.current(), 400);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => loadDataRef.current(), 400);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'verifications' }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => loadDataRef.current(), 400);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => loadDataRef.current(), 400);
        if (
          selectedSupportConvRef.current &&
          (payload?.new as any)?.conversation_id === selectedSupportConvRef.current.id
        ) {
          loadSupportMessagesRef.current?.(selectedSupportConvRef.current.id);
        }
      })
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [profile?.is_admin]);

  const onRefresh = () => {
    setRefreshing(true);
    loadAllData();
  };

  // ── Metrics Calculation ───────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const totalTransactions = transactions.length;
    const activeEscrow = transactions.filter(
      (t) => !['COMPLETED_FUNDS_RELEASED', 'CANCELLED'].includes(t.status),
    );
    const inTransit = transactions.filter((t) => t.status === 'IN_TRANSIT');
    const disputed = transactions.filter((t) => t.status === 'DISPUTED');
    const pendingKyc = verifications.filter((v) => v.status === 'submitted');
    const supportCount = supportConvs.length;
    const openSupportDisputes = supportConvs.filter((c) => c.is_dispute).length;

    const totalEscrowVolume = activeEscrow.reduce(
      (sum, t) => sum + (t.order?.amount_cents || t.amount_cents || 0),
      0,
    );

    return {
      totalTransactions,
      activeEscrowCount: activeEscrow.length,
      totalEscrowVolume,
      inTransitCount: inTransit.length,
      disputedCount: disputed.length,
      pendingKycCount: pendingKyc.length,
      supportCount,
      openSupportDisputes,
    };
  }, [transactions, verifications, supportConvs]);

  // ── Logistics Filtered Items ──────────────────────────────────────────────
  const filteredLogistics = useMemo(() => {
    let list = transactions;

    if (logisticsFilter === 'active') {
      list = list.filter((t) => !['COMPLETED_FUNDS_RELEASED', 'CANCELLED'].includes(t.status));
    } else if (logisticsFilter !== 'all') {
      list = list.filter((t) => t.status === logisticsFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (t) =>
          deriveRef(t.id).toLowerCase().includes(q) ||
          t.order_id.toLowerCase().includes(q) ||
          t.courier_name?.toLowerCase().includes(q) ||
          t.tracking_number?.toLowerCase().includes(q) ||
          t.buyer?.username.toLowerCase().includes(q) ||
          t.seller?.username.toLowerCase().includes(q) ||
          t.listing?.title.toLowerCase().includes(q),
      );
    }

    return list;
  }, [transactions, logisticsFilter, searchQuery]);

  // ── Disputed Orders ───────────────────────────────────────────────────────
  const disputedOrders = useMemo(() => {
    return transactions.filter((t) => t.status === 'DISPUTED');
  }, [transactions]);

  // ── Filtered KYC Verifications ────────────────────────────────────────────
  const filteredVerifications = useMemo(() => {
    if (verificationFilter === 'all') return verifications;
    return verifications.filter((v) => v.status === verificationFilter);
  }, [verifications, verificationFilter]);

  // ── Filtered Users ────────────────────────────────────────────────────────
  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return users;
    const q = userSearch.toLowerCase().trim();
    return users.filter(
      (u) =>
        u.username?.toLowerCase().includes(q) ||
        u.full_name?.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q),
    );
  }, [users, userSearch]);

  // ── Filtered Support Conversations ────────────────────────────────────────
  const filteredSupportConvs = useMemo(() => {
    let list = supportConvs;
    if (supportFilter === 'disputes') {
      list = list.filter((c) => c.is_dispute);
    } else if (supportFilter === 'general') {
      list = list.filter((c) => !c.is_dispute);
    }

    if (supportSearch.trim()) {
      const q = supportSearch.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.username.toLowerCase().includes(q) ||
          c.full_name.toLowerCase().includes(q) ||
          (c.last_message || '').toLowerCase().includes(q),
      );
    }

    return list;
  }, [supportConvs, supportFilter, supportSearch]);

  const loadSupportMessages = useCallback(async (convId: string) => {
    setLoadingSupportMessages(true);
    try {
      const msgs = await fetchAdminSupportMessages(convId);
      setSupportMessages(msgs);
    } catch (err: any) {
      toast.show('Failed to load support messages', { variant: 'default', icon: 'alert-triangle' });
    } finally {
      setLoadingSupportMessages(false);
    }
  }, [toast]);

  useEffect(() => {
    loadSupportMessagesRef.current = loadSupportMessages;
  }, [loadSupportMessages]);

  const handleSelectSupportConv = useCallback(
    (conv: AdminSupportConversation) => {
      tap('light');
      setSelectedSupportConv(conv);
      loadSupportMessages(conv.id);
    },
    [loadSupportMessages],
  );

  const handleSendAdminReply = async () => {
    if (!selectedSupportConv || !adminReplyText.trim() || sendingAdminReply) return;
    tap('medium');
    setSendingAdminReply(true);
    const textToSend = adminReplyText.trim();
    setAdminReplyText('');

    try {
      const sent = await adminSendSupportMessage({
        conversationId: selectedSupportConv.id,
        content: textToSend,
      });

      if (sent) {
        setSupportMessages((prev) => {
          if (prev.some((m) => m.id === sent.id)) return prev;
          return [...prev, sent];
        });
      }
      await loadSupportMessages(selectedSupportConv.id);

      toast.show('Reply sent to user', { variant: 'success', icon: 'check' });

      setSupportConvs((prev) =>
        prev.map((c) =>
          c.id === selectedSupportConv.id
            ? {
                ...c,
                last_message: `Grabsty Support: ${textToSend}`,
                updated_at: new Date().toISOString(),
              }
            : c,
        ),
      );
    } catch (err: any) {
      toast.show(err?.message || 'Failed to send admin reply', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      setSendingAdminReply(false);
    }
  };

  // ── Helper Actions ────────────────────────────────────────────────────────
  const copyText = async (text: string, label: string) => {
    tap('light');
    await Clipboard.setStringAsync(text);
    toast.show(`${label} copied to clipboard`, { variant: 'default', icon: 'check' });
  };

  const dialPhone = (phone?: string | null) => {
    if (!phone) {
      toast.show('No phone number recorded', { variant: 'default', icon: 'alert-triangle' });
      return;
    }
    tap('light');
    Linking.openURL(`tel:${phone}`).catch(() => {
      toast.show('Could not open phone dialer', { variant: 'default', icon: 'alert-triangle' });
    });
  };

  // ── Logistics State Transition ────────────────────────────────────────────
  const handleAdvanceStatus = async (
    targetStatus: EscrowStatus,
    extra: {
      courier?: string;
      trackingNumber?: string;
      notes?: string;
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
      await escrowService.advanceStatus({
        orderId: selectedTx.order_id,
        targetStatus,
        courier: extra.courier || null,
        trackingNumber: extra.trackingNumber || null,
        notes: extra.notes || null,
      });

      toast.show(`Order updated to ${targetStatus.replace(/_/g, ' ')}`, {
        variant: 'success',
        icon: 'check',
      });
      setShowDispatchModal(false);
      setSelectedTx(null);
      loadAllData();
    } catch (err: any) {
      toast.show(err?.message || 'Failed to update order status', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      setSubmittingAction(false);
    }
  };

  // ── Dispute Resolution ────────────────────────────────────────────────────
  const handleResolveDispute = async () => {
    if (!selectedTx?.order_id) return;
    tap('medium');
    setSubmittingAction(true);

    try {
      if (disputeResolutionType === 'release_to_seller') {
        await escrowService.advanceStatus({
          orderId: selectedTx.order_id,
          targetStatus: 'COMPLETED_FUNDS_RELEASED',
          notes: `[ADMIN RESOLUTION - RELEASED TO SELLER]: ${disputeNotes}`,
        });
        toast.show('Dispute resolved: Escrow released to seller', {
          variant: 'success',
          icon: 'check',
        });
      } else {
        await escrowService.advanceStatus({
          orderId: selectedTx.order_id,
          targetStatus: 'CANCELLED',
          cancelReason: `[ADMIN RESOLUTION - REFUNDED TO BUYER]: ${disputeNotes}`,
        });
        toast.show('Dispute resolved: Escrow refunded to buyer', {
          variant: 'success',
          icon: 'check',
        });
      }

      setShowDisputeModal(false);
      setSelectedTx(null);
      setDisputeNotes('');
      loadAllData();
    } catch (err: any) {
      toast.show(err?.message || 'Failed to resolve dispute', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      setSubmittingAction(false);
    }
  };

  // ── KYC Approval / Rejection ──────────────────────────────────────────────
  const handleKycAction = async (item: Verification, decision: 'approved' | 'rejected') => {
    tap('medium');
    setProcessingKycId(item.user_id);
    try {
      const { error } = await supabase.rpc('admin_review_kyc', {
        p_user_id: item.user_id,
        p_decision: decision,
      });
      if (error) throw error;

      toast.show(`Seller verification ${decision}`, {
        variant: 'success',
        icon: 'check',
      });
      loadAllData();
    } catch (err: any) {
      toast.show(err?.message || 'Failed to update KYC status', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      setProcessingKycId(null);
    }
  };

  // ── Auth Loading State ────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator size="large" color={theme.text} />
      </View>
    );
  }

  // ── Strict Security Guard (Off-Platform Access Control) ───────────────────
  if (!profile?.is_admin) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: isDark ? '#111111' : '#F5F5F7',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <View
          style={{
            maxWidth: 440,
            width: '100%',
            backgroundColor: theme.panel,
            borderRadius: 16,
            padding: 32,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: theme.border,
            shadowColor: '#000000',
            shadowOpacity: 0.08,
            shadowRadius: 16,
            elevation: 4,
          }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <Feather name="shield" size={26} color={theme.text} />
          </View>

          <Text
            style={{
              fontSize: 20,
              fontWeight: '700',
              color: theme.text,
              letterSpacing: -0.3,
              textAlign: 'center',
            }}
          >
            Administration Portal
          </Text>

          <Text
            style={{
              fontSize: 13,
              color: theme.textMuted,
              textAlign: 'center',
              marginTop: 8,
              lineHeight: 18,
            }}
          >
            This management console is isolated from consumer profiles. Access is restricted to authorized platform administrators.
          </Text>

          <Pressable
            onPress={() => router.push('/auth/login')}
            style={({ pressed }) => ({
              width: '100%',
              height: 42,
              backgroundColor: theme.ink,
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 24,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.background }}>
              Sign In as Administrator
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.push('/')}
            style={({ pressed }) => ({
              width: '100%',
              height: 42,
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 8,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ fontSize: 13, fontWeight: '500', color: theme.textMuted }}>
              Return to Marketplace Storefront
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Unified Administration Console ────────────────────────────────────────
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: isDark ? '#141414' : '#F5F5F7' }}>
      <KeyboardAvoider style={{ flex: 1 }}>
      {/* Top Console Navigation Bar */}
      <View
        style={{
          height: 56,
          backgroundColor: theme.panel,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text, letterSpacing: -0.2 }}>
            Grabsty Admin
          </Text>
          {isDesktop && (<View
            style={{
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 4,
              backgroundColor: isDark ? '#2A2A2A' : '#EAEAEA',
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: '700', color: theme.textMuted, letterSpacing: 0.5 }}>
              OFF-PLATFORM
            </Text>
          </View>)}

          {isDesktop && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 16 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' }} />
              <Text style={{ fontSize: 12, color: theme.textMuted }}>
                Live Platform Sync Connected
              </Text>
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable
            onPress={onRefresh}
            hitSlop={8}
            style={({ pressed }) => ({
              paddingHorizontal: 10,
              height: 32,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.panel,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Feather name="refresh-cw" size={13} color={theme.text} />
            {isDesktop && <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text }}>Refresh</Text>}
          </Pressable>

          <Pressable
            onPress={() => router.push('/')}
            hitSlop={8}
            style={({ pressed }) => ({
              paddingHorizontal: 12,
              height: 32,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.panel,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Feather name="external-link" size={13} color={theme.text} />
            {isDesktop && <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text }}>Storefront</Text>}
          </Pressable>

          <Pressable
            onPress={signOut}
            hitSlop={8}
            style={({ pressed }) => ({
              width: 32,
              height: 32,
              borderRadius: 6,
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Feather name="log-out" size={14} color={theme.text} />
          </Pressable>
        </View>
      </View>

      {/* Main Administrative Layout */}
      <View style={{ flex: 1, flexDirection: isDesktop ? 'row' : 'column' }}>
        {/* Navigation Sidebar (Desktop) or Tab Strip (Mobile) */}
        {isDesktop ? (
          <View
            style={{
              width: 240,
              backgroundColor: theme.panel,
              borderRightWidth: 1,
              borderRightColor: theme.border,
              paddingTop: 16,
              paddingHorizontal: 12,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted, letterSpacing: 0.8, marginBottom: 8, paddingHorizontal: 8 }}>
              OPERATIONAL MODULES
            </Text>

            <Pressable
              onPress={() => setActiveTab('overview')}
              style={({ pressed }) => ({
                height: 38,
                borderRadius: 8,
                backgroundColor: activeTab === 'overview' ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)') : 'transparent',
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                gap: 10,
                opacity: pressed ? 0.8 : 1,
                marginBottom: 2,
              })}
            >
              <Feather name="activity" size={16} color={activeTab === 'overview' ? theme.text : theme.textMuted} />
              <Text style={{ flex: 1, fontSize: 14, fontWeight: activeTab === 'overview' ? '600' : '500', color: activeTab === 'overview' ? theme.text : theme.textMuted }}>
                Overview
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setActiveTab('logistics')}
              style={({ pressed }) => ({
                height: 38,
                borderRadius: 8,
                backgroundColor: activeTab === 'logistics' ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)') : 'transparent',
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                gap: 10,
                opacity: pressed ? 0.8 : 1,
                marginBottom: 2,
              })}
            >
              <Feather name="truck" size={16} color={activeTab === 'logistics' ? theme.text : theme.textMuted} />
              <Text style={{ flex: 1, fontSize: 14, fontWeight: activeTab === 'logistics' ? '600' : '500', color: activeTab === 'logistics' ? theme.text : theme.textMuted }}>
                Logistics & Orders
              </Text>
              {metrics.activeEscrowCount > 0 && (
                <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: theme.text }}>{metrics.activeEscrowCount}</Text>
                </View>
              )}
            </Pressable>

            <Pressable
              onPress={() => setActiveTab('disputes')}
              style={({ pressed }) => ({
                height: 38,
                borderRadius: 8,
                backgroundColor: activeTab === 'disputes' ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)') : 'transparent',
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                gap: 10,
                opacity: pressed ? 0.8 : 1,
                marginBottom: 2,
              })}
            >
              <Feather name="alert-circle" size={16} color={activeTab === 'disputes' ? theme.danger : theme.textMuted} />
              <Text style={{ flex: 1, fontSize: 14, fontWeight: activeTab === 'disputes' ? '600' : '500', color: activeTab === 'disputes' ? theme.danger : theme.textMuted }}>
                Disputes & Refunds
              </Text>
              {metrics.disputedCount > 0 && (
                <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: 'rgba(239,68,68,0.15)' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: theme.danger }}>{metrics.disputedCount}</Text>
                </View>
              )}
            </Pressable>

            <Pressable
              onPress={() => setActiveTab('verifications')}
              style={({ pressed }) => ({
                height: 38,
                borderRadius: 8,
                backgroundColor: activeTab === 'verifications' ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)') : 'transparent',
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                gap: 10,
                opacity: pressed ? 0.8 : 1,
                marginBottom: 2,
              })}
            >
              <Feather name="shield" size={16} color={activeTab === 'verifications' ? theme.text : theme.textMuted} />
              <Text style={{ flex: 1, fontSize: 14, fontWeight: activeTab === 'verifications' ? '600' : '500', color: activeTab === 'verifications' ? theme.text : theme.textMuted }}>
                Seller KYC Verifications
              </Text>
              {metrics.pendingKycCount > 0 && (
                <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: 'rgba(108,71,255,0.15)' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: theme.purple }}>{metrics.pendingKycCount}</Text>
                </View>
              )}
            </Pressable>

            <Pressable
              onPress={() => setActiveTab('users')}
              style={({ pressed }) => ({
                height: 38,
                borderRadius: 8,
                backgroundColor: activeTab === 'users' ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)') : 'transparent',
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                gap: 10,
                opacity: pressed ? 0.8 : 1,
                marginBottom: 2,
              })}
            >
              <Feather name="users" size={16} color={activeTab === 'users' ? theme.text : theme.textMuted} />
              <Text style={{ flex: 1, fontSize: 14, fontWeight: activeTab === 'users' ? '600' : '500', color: activeTab === 'users' ? theme.text : theme.textMuted }}>
                Sellers & Users
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setActiveTab('support')}
              style={({ pressed }) => ({
                height: 38,
                borderRadius: 8,
                backgroundColor: activeTab === 'support' ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)') : 'transparent',
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                gap: 10,
                opacity: pressed ? 0.8 : 1,
                marginBottom: 2,
              })}
            >
              <Feather name="message-square" size={16} color={activeTab === 'support' ? theme.purple : theme.textMuted} />
              <Text style={{ flex: 1, fontSize: 14, fontWeight: activeTab === 'support' ? '600' : '500', color: activeTab === 'support' ? theme.purple : theme.textMuted }}>
                Support Chats
              </Text>
              {metrics.supportCount > 0 && (
                <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: 'rgba(108,71,255,0.15)' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: theme.purple }}>{metrics.supportCount}</Text>
                </View>
              )}
            </Pressable>
          </View>
        ) : (
          /* Mobile Horizontal Navigation Pills */
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            // RN-web ScrollViews grow by default; in this column layout the tab
            // strip would otherwise claim half the phone screen.
            style={{ flexGrow: 0, flexShrink: 0 }}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingVertical: 10,
              gap: 8,
              backgroundColor: theme.panel,
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
            }}
          >
            {[
              { key: 'overview', label: 'Overview', icon: 'activity' },
              { key: 'logistics', label: `Orders (${metrics.activeEscrowCount})`, icon: 'truck' },
              { key: 'disputes', label: `Disputes (${metrics.disputedCount})`, icon: 'alert-circle' },
              { key: 'verifications', label: `KYC (${metrics.pendingKycCount})`, icon: 'shield' },
              { key: 'users', label: 'Users', icon: 'users' },
              { key: 'support', label: `Support (${metrics.supportCount})`, icon: 'message-square' },
            ].map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => {
                    tap('light');
                    setActiveTab(tab.key as AdminTab);
                  }}
                  style={({ pressed }) => ({
                    height: 32,
                    borderRadius: 16,
                    paddingHorizontal: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: isActive ? theme.ink : theme.surface,
                    borderWidth: 1,
                    borderColor: isActive ? theme.ink : theme.border,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Feather name={tab.icon as any} size={13} color={isActive ? theme.background : theme.text} />
                  <Text style={{ fontSize: 12, fontWeight: isActive ? '700' : '600', color: isActive ? theme.background : theme.text }}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Operational Workspace */}
        <View style={{ flex: 1, padding: isDesktop ? 24 : 16 }}>
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: theme.text, letterSpacing: -0.4 }}>
                  Overview
                </Text>
              </View>

              {/* Metric Cards Grid */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 24 }}>
                <View style={{ flex: 1, minWidth: 200, backgroundColor: theme.panel, borderRadius: 12, padding: 18, borderWidth: 1, borderColor: theme.border }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textMuted }}>Money held</Text>
                  <Text style={{ fontSize: 26, fontWeight: '800', color: theme.text, marginTop: 8 }}>
                    {formatPrice(metrics.totalEscrowVolume / 100)}
                  </Text>
                </View>

                <View style={{ flex: 1, minWidth: 200, backgroundColor: theme.panel, borderRadius: 12, padding: 18, borderWidth: 1, borderColor: theme.border }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textMuted }}>In transit</Text>
                  <Text style={{ fontSize: 26, fontWeight: '800', color: theme.text, marginTop: 8 }}>
                    {metrics.inTransitCount}
                  </Text>
                </View>

                <View style={{ flex: 1, minWidth: 200, backgroundColor: theme.panel, borderRadius: 12, padding: 18, borderWidth: 1, borderColor: metrics.disputedCount > 0 ? 'rgba(239,68,68,0.4)' : theme.border }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: metrics.disputedCount > 0 ? theme.danger : theme.textMuted }}>
                    Open disputes
                  </Text>
                  <Text style={{ fontSize: 26, fontWeight: '800', color: metrics.disputedCount > 0 ? theme.danger : theme.text, marginTop: 8 }}>
                    {metrics.disputedCount}
                  </Text>
                </View>

                <View style={{ flex: 1, minWidth: 200, backgroundColor: theme.panel, borderRadius: 12, padding: 18, borderWidth: 1, borderColor: metrics.pendingKycCount > 0 ? 'rgba(108,71,255,0.4)' : theme.border }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: metrics.pendingKycCount > 0 ? theme.purple : theme.textMuted }}>
                    Seller ID checks
                  </Text>
                  <Text style={{ fontSize: 26, fontWeight: '800', color: metrics.pendingKycCount > 0 ? theme.purple : theme.text, marginTop: 8 }}>
                    {metrics.pendingKycCount}
                  </Text>
                </View>

                <View style={{ flex: 1, minWidth: 200, backgroundColor: theme.panel, borderRadius: 12, padding: 18, borderWidth: 1, borderColor: metrics.supportCount > 0 ? 'rgba(108,71,255,0.4)' : theme.border }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: metrics.supportCount > 0 ? theme.purple : theme.textMuted }}>
                    Support chats
                  </Text>
                  <Text style={{ fontSize: 26, fontWeight: '800', color: theme.text, marginTop: 8 }}>
                    {metrics.supportCount}
                  </Text>
                </View>
              </View>

            </ScrollView>
          )}

          {/* TAB 2: LOGISTICS & ESCROW ORDERS */}
          {activeTab === 'logistics' && (
            <View style={{ flex: 1 }}>
              {/* Filter and Search Bar */}
              <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 10, marginBottom: 14, alignItems: isDesktop ? 'center' : 'stretch', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {(['all', 'active', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED_FUNDS_RELEASED'] as const).map((filter) => (
                    <Pressable
                      key={filter}
                      onPress={() => setLogisticsFilter(filter)}
                      style={({ pressed }) => ({
                        height: 32,
                        paddingHorizontal: 12,
                        borderRadius: 6,
                        backgroundColor: logisticsFilter === filter ? theme.ink : theme.panel,
                        borderWidth: 1,
                        borderColor: logisticsFilter === filter ? theme.ink : theme.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed ? 0.8 : 1,
                      })}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: logisticsFilter === filter ? theme.background : theme.text, textTransform: 'capitalize' }}>
                        {filter === 'IN_TRANSIT' ? 'In Transit' : filter === 'DELIVERED' ? 'Delivered' : filter === 'COMPLETED_FUNDS_RELEASED' ? 'Completed' : filter}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.panel, borderRadius: 8, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 10, minHeight: 38, width: isDesktop ? 260 : '100%' }}>
                  <Feather name="search" size={14} color={theme.textMuted} />
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search order, ref, buyer, seller..."
                    placeholderTextColor={theme.textMuted}
                    style={{ flex: 1, marginLeft: 8, fontSize: 13, color: theme.text, paddingVertical: 6 }}
                  />
                  {searchQuery ? (
                    <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                      <Feather name="x" size={14} color={theme.textMuted} />
                    </Pressable>
                  ) : null}
                </View>
              </View>

              {/* Transactions List */}
              <FlatList
                data={filteredLogistics}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={true}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                contentContainerStyle={{ paddingBottom: 40 }}
                ListEmptyComponent={
                  <View style={{ padding: 40, alignItems: 'center', backgroundColor: theme.panel, borderRadius: 12, borderWidth: 1, borderColor: theme.border }}>
                    <Feather name="inbox" size={32} color={theme.textMuted} />
                    <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text, marginTop: 10 }}>No matching orders found</Text>
                    <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>Adjust your search query or filter</Text>
                  </View>
                }
                renderItem={({ item }) => {
                  const statusStyle = getEscrowStatusStyle(item.status);
                  const refCode = deriveRef(item.id);
                  const courierName = item.courier_name || item.order?.courier_name || 'Unassigned';

                  return (
                    <View
                      style={{
                        backgroundColor: theme.panel,
                        borderRadius: 12,
                        padding: 16,
                        borderWidth: 1,
                        borderColor: theme.border,
                        marginBottom: 10,
                      }}
                    >
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 4, alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: theme.text, letterSpacing: -0.1 }}>
                            #{refCode}
                          </Text>
                          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, backgroundColor: statusStyle.bg }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: statusStyle.color }}>
                              {statusStyle.label.toUpperCase()}
                            </Text>
                          </View>
                        </View>

                        <Text style={{ fontSize: 12, color: theme.textMuted }}>
                          {formatDate(item.updated_at || item.created_at)}
                        </Text>
                      </View>

                      {/* Item Details */}
                      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                        {item.listing ? (
                          <Image
                            source={{ uri: getOptimizedImageUrl(cardImageUrl(item.listing), { width: 160 }) }}
                            style={{ width: 52, height: 52, borderRadius: 8 }}
                            contentFit="cover"
                            transition={IMAGE_TRANSITION}
                          />
                        ) : (
                          <View style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center' }}>
                            <Feather name="package" size={20} color={theme.textMuted} />
                          </View>
                        )}

                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }} numberOfLines={1}>
                            {item.listing?.title || 'Marketplace Item'}
                          </Text>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: theme.text, marginTop: 2 }}>
                            {formatPrice((item.order?.amount_cents || item.amount_cents || 0) / 100)}
                          </Text>
                          <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                            Buyer: @{item.buyer?.username || 'user'} · Seller: @{item.seller?.username || 'user'}
                          </Text>
                        </View>
                      </View>

                      {/* Courier & Tracking */}
                      <View style={{ backgroundColor: theme.surface, borderRadius: 8, padding: 10, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Feather name="truck" size={14} color={theme.textMuted} />
                          <Text style={{ fontSize: 12, color: theme.text }}>
                            Courier: <Text style={{ fontWeight: '700' }}>{courierName}</Text>
                            {item.tracking_number && (
                              <Text> · Track #: <Text style={{ fontWeight: '700' }}>{item.tracking_number}</Text></Text>
                            )}
                          </Text>
                        </View>

                        {item.tracking_number && (
                          <Pressable
                            onPress={() => copyText(item.tracking_number!, 'Tracking number')}
                            hitSlop={8}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                          >
                            <Feather name="copy" size={12} color={theme.textMuted} />
                            <Text style={{ fontSize: 11, fontWeight: '600', color: theme.textMuted }}>Copy</Text>
                          </Pressable>
                        )}
                      </View>

                      {/* Actions Toolbar */}
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                        {item.order?.shipping_address?.phone && (
                          <Pressable
                            onPress={() => dialPhone(item.order?.shipping_address?.phone)}
                            style={({ pressed }) => ({
                              height: 32,
                              paddingHorizontal: 10,
                              borderRadius: 6,
                              borderWidth: 1,
                              borderColor: theme.border,
                              backgroundColor: theme.panel,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 6,
                              opacity: pressed ? 0.7 : 1,
                            })}
                          >
                            <Feather name="phone" size={12} color={theme.text} />
                            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text }}>Call Buyer</Text>
                          </Pressable>
                        )}

                        <Pressable
                          onPress={() => {
                            setSelectedTx(item);
                            setSelectedCourier(item.courier_name || COURIER_PRESETS[0]);
                            setTrackingNumber(item.tracking_number || '');
                            setShowDispatchModal(true);
                          }}
                          style={({ pressed }) => ({
                            height: 32,
                            paddingHorizontal: 12,
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: theme.border,
                            backgroundColor: theme.panel,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            opacity: pressed ? 0.7 : 1,
                          })}
                        >
                          <Feather name="edit-2" size={12} color={theme.text} />
                          <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text }}>Update Dispatch</Text>
                        </Pressable>

                        {item.status === 'READY_FOR_PICKUP' && (
                          <Pressable
                            onPress={() => {
                              setSelectedTx(item);
                              handleAdvanceStatus('IN_TRANSIT');
                            }}
                            style={({ pressed }) => ({
                              height: 32,
                              paddingHorizontal: 12,
                              borderRadius: 6,
                              backgroundColor: theme.ink,
                              alignItems: 'center',
                              justifyContent: 'center',
                              opacity: pressed ? 0.8 : 1,
                            })}
                          >
                            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.background }}>Mark In Transit</Text>
                          </Pressable>
                        )}

                        {item.status === 'IN_TRANSIT' && (
                          <Pressable
                            onPress={() => {
                              setSelectedTx(item);
                              handleAdvanceStatus('DELIVERED');
                            }}
                            style={({ pressed }) => ({
                              height: 32,
                              paddingHorizontal: 12,
                              borderRadius: 6,
                              backgroundColor: '#10B981',
                              alignItems: 'center',
                              justifyContent: 'center',
                              opacity: pressed ? 0.8 : 1,
                            })}
                          >
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>Mark Delivered</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  );
                }}
              />
            </View>
          )}

          {/* TAB 3: DISPUTES & REFUNDS */}
          {activeTab === 'disputes' && (
            <View style={{ flex: 1 }}>
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: theme.text }}>
                  Dispute Resolution Workbench ({disputedOrders.length})
                </Text>
                <Text style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>
                  Adjudicate contested escrow transactions. Release held funds to the seller or refund the buyer.
                </Text>
              </View>

              <FlatList
                data={disputedOrders}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={true}
                ListEmptyComponent={
                  <View style={{ padding: 40, alignItems: 'center', backgroundColor: theme.panel, borderRadius: 12, borderWidth: 1, borderColor: theme.border }}>
                    <Feather name="check-circle" size={32} color="#10B981" />
                    <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text, marginTop: 10 }}>Zero Active Disputes</Text>
                    <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>All marketplace transactions are operating normally</Text>
                  </View>
                }
                renderItem={({ item }) => {
                  const claimNotes = item.dispute_reason || item.logistics_notes || item.order?.dispute_reason;

                  return (
                    <View
                      style={{
                        backgroundColor: theme.panel,
                        borderRadius: 12,
                        padding: 16,
                        borderWidth: 1,
                        borderColor: 'rgba(239, 68, 68, 0.35)',
                        marginBottom: 12,
                      }}
                    >
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 4, alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: theme.danger }}>
                            DISPUTE #{deriveRef(item.id)}
                          </Text>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>
                            {formatPrice((item.order?.amount_cents || item.amount_cents || 0) / 100)}
                          </Text>
                        </View>

                        <Text style={{ fontSize: 12, color: theme.textMuted }}>
                          Opened: {formatDate(item.updated_at || item.created_at)}
                        </Text>
                      </View>

                      <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 4 }}>
                        {item.listing?.title || 'Order Item'}
                      </Text>

                      <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: 12 }}>
                        Buyer: @{item.buyer?.username} · Seller: @{item.seller?.username}
                      </Text>

                      {claimNotes && (
                        <View style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2', padding: 12, borderRadius: 8, marginBottom: 14 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: theme.danger, textTransform: 'uppercase', marginBottom: 4 }}>
                            Claim Description:
                          </Text>
                          <Text style={{ fontSize: 13, color: isDark ? '#FCA5A5' : '#991B1B' }}>
                            {claimNotes}
                          </Text>
                        </View>
                      )}

                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
                        <Pressable
                          onPress={() => {
                            const buyerId = item.buyer_id || item.buyer?.id;
                            const match = supportConvs.find((c) => c.user_id === buyerId);
                            if (match) {
                              handleSelectSupportConv(match);
                            }
                            setActiveTab('support');
                          }}
                          style={({ pressed }) => ({
                            height: 36,
                            paddingHorizontal: 12,
                            borderRadius: 8,
                            backgroundColor: theme.surface,
                            borderWidth: 1,
                            borderColor: theme.border,
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexDirection: 'row',
                            gap: 6,
                            opacity: pressed ? 0.75 : 1,
                          })}
                        >
                          <Feather name="message-square" size={13} color={theme.purple} />
                          <Text style={{ fontSize: 13, fontWeight: '600', color: theme.purple }}>Support Chat</Text>
                        </Pressable>

                        <Pressable
                          onPress={() => {
                            setSelectedTx(item);
                            setDisputeResolutionType('refund_buyer');
                            setShowDisputeModal(true);
                          }}
                          style={({ pressed }) => ({
                            height: 36,
                            paddingHorizontal: 14,
                            borderRadius: 8,
                            backgroundColor: 'rgba(239,68,68,0.1)',
                            borderWidth: 1,
                            borderColor: 'rgba(239,68,68,0.3)',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: pressed ? 0.75 : 1,
                          })}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '700', color: theme.danger }}>Refund Buyer</Text>
                        </Pressable>

                        <Pressable
                          onPress={() => {
                            setSelectedTx(item);
                            setDisputeResolutionType('release_to_seller');
                            setShowDisputeModal(true);
                          }}
                          style={({ pressed }) => ({
                            height: 36,
                            paddingHorizontal: 14,
                            borderRadius: 8,
                            backgroundColor: '#10B981',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: pressed ? 0.8 : 1,
                          })}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>Release to Seller</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                }}
              />
            </View>
          )}

          {/* TAB 4: SELLER KYC VERIFICATIONS */}
          {activeTab === 'verifications' && (
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 10, marginBottom: 14, alignItems: isDesktop ? 'center' : 'stretch', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {(['submitted', 'approved', 'rejected', 'all'] as const).map((filter) => (
                    <Pressable
                      key={filter}
                      onPress={() => setVerificationFilter(filter)}
                      style={({ pressed }) => ({
                        height: 32,
                        paddingHorizontal: 12,
                        borderRadius: 6,
                        backgroundColor: verificationFilter === filter ? theme.ink : theme.panel,
                        borderWidth: 1,
                        borderColor: verificationFilter === filter ? theme.ink : theme.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed ? 0.8 : 1,
                      })}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: verificationFilter === filter ? theme.background : theme.text, textTransform: 'capitalize' }}>
                        {filter === 'submitted' ? 'Pending' : filter}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={{ fontSize: 12, color: theme.textMuted }}>
                  Total {filteredVerifications.length} submissions
                </Text>
              </View>

              <FlatList
                data={filteredVerifications}
                keyExtractor={(item) => item.user_id}
                showsVerticalScrollIndicator={true}
                ListEmptyComponent={
                  <View style={{ padding: 40, alignItems: 'center', backgroundColor: theme.panel, borderRadius: 12, borderWidth: 1, borderColor: theme.border }}>
                    <Feather name="shield" size={32} color={theme.textMuted} />
                    <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text, marginTop: 10 }}>No identity submissions found</Text>
                  </View>
                }
                renderItem={({ item }) => {
                  const isPending = item.status === 'submitted';
                  const isApproved = item.status === 'approved';
                  const isProcessing = processingKycId === item.user_id;

                  return (
                    <View
                      style={{
                        backgroundColor: theme.panel,
                        borderRadius: 12,
                        padding: 16,
                        borderWidth: 1,
                        borderColor: theme.border,
                        marginBottom: 10,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>
                            {item.legal_name}
                          </Text>
                          <View
                            style={{
                              paddingHorizontal: 8,
                              paddingVertical: 2,
                              borderRadius: 4,
                              backgroundColor: isApproved ? 'rgba(16,185,129,0.15)' : isPending ? 'rgba(108,71,255,0.15)' : 'rgba(239,68,68,0.15)',
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: '700',
                                color: isApproved ? '#10B981' : isPending ? theme.purple : theme.danger,
                              }}
                            >
                              {item.status.toUpperCase()}
                            </Text>
                          </View>
                        </View>

                        <Text style={{ fontSize: 12, color: theme.textMuted }}>
                          Submitted: {formatDate(item.submitted_at)}
                        </Text>
                      </View>

                      <Text style={{ fontSize: 13, color: theme.text, marginBottom: (item.notes || item.id_photo_url) ? 8 : 12 }}>
                        Document: <Text style={{ fontWeight: '700', textTransform: 'capitalize' }}>{item.document_kind.replace(/_/g, ' ')}</Text> · Number (Last 4): <Text style={{ fontWeight: '700' }}>{item.document_number_last4 || 'N/A'}</Text>
                      </Text>

                      {Boolean(item.notes || item.id_photo_url) && (
                        <View style={{ marginBottom: 12 }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textMuted, marginBottom: 6 }}>
                            Attached CNIC / ID Photo:
                          </Text>
                          <KycPhoto
                            value={(item.id_photo_url || item.notes)!}
                            style={{
                              width: 200,
                              height: 120,
                              borderRadius: 8,
                              backgroundColor: isDark ? '#111111' : '#EEEEEE',
                              borderWidth: 1,
                              borderColor: theme.border,
                            }}
                          />
                        </View>
                      )}

                      {isPending && (
                        <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
                          <Pressable
                            disabled={isProcessing}
                            onPress={() => handleKycAction(item, 'rejected')}
                            style={({ pressed }) => ({
                              height: 32,
                              paddingHorizontal: 12,
                              borderRadius: 6,
                              borderWidth: 1,
                              borderColor: 'rgba(239,68,68,0.3)',
                              backgroundColor: 'rgba(239,68,68,0.06)',
                              alignItems: 'center',
                              justifyContent: 'center',
                              opacity: pressed || isProcessing ? 0.6 : 1,
                            })}
                          >
                            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.danger }}>Reject</Text>
                          </Pressable>

                          <Pressable
                            disabled={isProcessing}
                            onPress={() => handleKycAction(item, 'approved')}
                            style={({ pressed }) => ({
                              height: 32,
                              paddingHorizontal: 14,
                              borderRadius: 6,
                              backgroundColor: '#10B981',
                              alignItems: 'center',
                              justifyContent: 'center',
                              opacity: pressed || isProcessing ? 0.7 : 1,
                            })}
                          >
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>Approve Verification</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  );
                }}
              />
            </View>
          )}

          {/* TAB 5: USERS & SELLERS DIRECTORY */}
          {activeTab === 'users' && (
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 10, marginBottom: 14, alignItems: isDesktop ? 'center' : 'stretch', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.panel, borderRadius: 8, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 10, minHeight: 38, width: isDesktop ? 300 : '100%' }}>
                  <Feather name="search" size={14} color={theme.textMuted} />
                  <TextInput
                    value={userSearch}
                    onChangeText={setUserSearch}
                    placeholder="Search by username, full name, ID..."
                    placeholderTextColor={theme.textMuted}
                    style={{ flex: 1, marginLeft: 8, fontSize: 13, color: theme.text, paddingVertical: 6 }}
                  />
                  {userSearch ? (
                    <Pressable onPress={() => setUserSearch('')} hitSlop={8}>
                      <Feather name="x" size={14} color={theme.textMuted} />
                    </Pressable>
                  ) : null}
                </View>

                <Text style={{ fontSize: 12, color: theme.textMuted }}>
                  Total {filteredUsers.length} members
                </Text>
              </View>

              <FlatList
                data={filteredUsers}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={true}
                renderItem={({ item }) => {
                  const initial = (item.full_name || item.username || 'U').charAt(0).toUpperCase();

                  return (
                    <View
                      style={{
                        backgroundColor: theme.panel,
                        borderRadius: 12,
                        padding: 14,
                        borderWidth: 1,
                        borderColor: theme.border,
                        marginBottom: 10,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                          {item.avatar_url ? (
                            <Image
                              source={{ uri: getOptimizedImageUrl(item.avatar_url, { width: 80 }) }}
                              style={{ width: 40, height: 40 }}
                              contentFit="cover"
                            />
                          ) : (
                            <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>{initial}</Text>
                          )}
                        </View>

                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }} numberOfLines={1}>
                              {item.full_name || item.username}
                            </Text>
                            {item.is_verified && <ShieldCheckIcon size={14} />}
                            {item.is_admin && (
                              <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: isDark ? '#333' : '#E5E5E5' }}>
                                <Text style={{ fontSize: 9, fontWeight: '800', color: theme.text }}>ADMIN</Text>
                              </View>
                            )}
                          </View>
                          <Text style={{ fontSize: 12, color: theme.textMuted }}>@{item.username} · {item.total_sales || 0} sales</Text>
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <Pressable
                          onPress={() => router.push(`/user/${item.id}` as any)}
                          style={({ pressed }) => ({
                            width: 32,
                            height: 32,
                            borderRadius: 6,
                            backgroundColor: theme.surface,
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: pressed ? 0.7 : 1,
                          })}
                        >
                          <Feather name="external-link" size={14} color={theme.text} />
                        </Pressable>
                      </View>
                    </View>
                  );
                }}
              />
            </View>
          )}

          {/* TAB 6: SUPPORT CHATS & INQUIRIES WORKBENCH */}
          {activeTab === 'support' && (
            <View style={{ flex: 1 }}>
              {/* Header (hidden on phones while a chat is open, so the thread gets the screen) */}
              {(isDesktop || !selectedSupportConv) && (<View
                style={{
                  flexDirection: isDesktop ? 'row' : 'column',
                  gap: 12,
                  marginBottom: 16,
                  alignItems: isDesktop ? 'center' : 'stretch',
                  justifyContent: 'space-between',
                }}
              >
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 20, fontWeight: '800', color: theme.text, letterSpacing: -0.3 }}>
                      Support Inquiries & Live Chat
                    </Text>
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 10,
                        backgroundColor: 'rgba(108,71,255,0.15)',
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '800', color: theme.purple }}>
                        {filteredSupportConvs.length}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 13, color: theme.textMuted, marginTop: 3 }}>
                    Personally assist buyers and sellers, investigate order issues, and resolve dispute tickets.
                  </Text>
                </View>

                {/* Filter Pills */}
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {(['all', 'disputes', 'general'] as const).map((filter) => {
                    const isActive = supportFilter === filter;
                    const count =
                      filter === 'all'
                        ? supportConvs.length
                        : filter === 'disputes'
                        ? supportConvs.filter((c) => c.is_dispute).length
                        : supportConvs.filter((c) => !c.is_dispute).length;

                    return (
                      <Pressable
                        key={filter}
                        onPress={() => {
                          tap('light');
                          setSupportFilter(filter);
                        }}
                        style={({ pressed }) => ({
                          height: 32,
                          paddingHorizontal: 12,
                          borderRadius: 16,
                          backgroundColor: isActive ? theme.ink : theme.panel,
                          borderWidth: 1,
                          borderColor: isActive ? theme.ink : theme.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexDirection: 'row',
                          gap: 6,
                          opacity: pressed ? 0.8 : 1,
                        })}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: isActive ? '700' : '600',
                            color: isActive ? theme.background : theme.text,
                            textTransform: 'capitalize',
                          }}
                        >
                          {filter === 'disputes' ? 'Disputes' : filter === 'general' ? 'General' : 'All'}
                        </Text>
                        <View
                          style={{
                            paddingHorizontal: 5,
                            paddingVertical: 1,
                            borderRadius: 8,
                            backgroundColor: isActive
                              ? isDark
                                ? 'rgba(0,0,0,0.3)'
                                : 'rgba(255,255,255,0.2)'
                              : theme.surface,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: '700',
                              color: isActive ? theme.background : theme.textMuted,
                            }}
                          >
                            {count}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>)}

              {/* Main Support Area: 2 Columns on Desktop, List/Detail on Mobile */}
              <View style={{ flex: 1, flexDirection: isDesktop ? 'row' : 'column', gap: 16 }}>
                {/* Conversations List Column */}
                {(!selectedSupportConv || isDesktop) && (
                  <View
                    style={{
                      width: isDesktop ? 360 : '100%',
                      flex: isDesktop ? undefined : 1,
                      backgroundColor: theme.panel,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: theme.border,
                      overflow: 'hidden',
                      display: !isDesktop && selectedSupportConv ? 'none' : 'flex',
                    }}
                  >
                    {/* Search Bar */}
                    <View
                      style={{
                        padding: 12,
                        borderBottomWidth: 1,
                        borderBottomColor: theme.border,
                      }}
                    >
                      <View
                        style={{
                          minHeight: 38,
                          borderRadius: 8,
                          backgroundColor: theme.surface,
                          borderWidth: 1,
                          borderColor: theme.border,
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingHorizontal: 10,
                          gap: 8,
                        }}
                      >
                        <Feather name="search" size={14} color={theme.textMuted} />
                        <TextInput
                          value={supportSearch}
                          onChangeText={setSupportSearch}
                          placeholder="Search user or message..."
                          placeholderTextColor={theme.textMuted}
                          style={{ flex: 1, fontSize: 13, color: theme.text, paddingVertical: 6 }}
                        />
                        {supportSearch.length > 0 && (
                          <Pressable onPress={() => setSupportSearch('')} hitSlop={6}>
                            <Feather name="x" size={14} color={theme.textMuted} />
                          </Pressable>
                        )}
                      </View>
                    </View>

                    {/* Conversations List */}
                    <FlatList
                      data={filteredSupportConvs}
                      keyExtractor={(item) => item.id}
                      showsVerticalScrollIndicator={true}
                      ListEmptyComponent={
                        <View style={{ padding: 40, alignItems: 'center' }}>
                          <Feather name="message-square" size={28} color={theme.textMuted} />
                          <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text, marginTop: 10 }}>
                            No Support Inquiries
                          </Text>
                          <Text style={{ fontSize: 12, color: theme.textMuted, textAlign: 'center', marginTop: 4 }}>
                            {supportSearch
                              ? 'No conversations match your search filter.'
                              : 'Support inquiries and disputed order chats will appear here.'}
                          </Text>
                        </View>
                      }
                      renderItem={({ item }) => {
                        const isSelected = selectedSupportConv?.id === item.id;
                        const initial = (item.full_name || item.username || 'U').charAt(0).toUpperCase();

                        return (
                          <Pressable
                            onPress={() => handleSelectSupportConv(item)}
                            style={({ pressed }) => ({
                              padding: 14,
                              borderBottomWidth: 1,
                              borderBottomColor: theme.border,
                              backgroundColor: isSelected
                                ? isDark
                                  ? 'rgba(108,71,255,0.12)'
                                  : 'rgba(108,71,255,0.06)'
                                : pressed
                                ? isDark
                                  ? 'rgba(255,255,255,0.03)'
                                  : 'rgba(0,0,0,0.02)'
                                : 'transparent',
                              borderLeftWidth: isSelected ? 3 : 0,
                              borderLeftColor: theme.purple,
                            })}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                              <View
                                style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: 18,
                                  backgroundColor: theme.surface,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  overflow: 'hidden',
                                }}
                              >
                                {item.avatar_url ? (
                                  <Image
                                    source={{ uri: getOptimizedImageUrl(item.avatar_url, { width: 72 }) }}
                                    style={{ width: 36, height: 36 }}
                                    contentFit="cover"
                                  />
                                ) : (
                                  <Text style={{ fontSize: 14, fontWeight: '800', color: theme.text }}>
                                    {initial}
                                  </Text>
                                )}
                              </View>

                              <View style={{ flex: 1, minWidth: 0 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <Text
                                    style={{
                                      fontSize: 13,
                                      fontWeight: isSelected ? '700' : '600',
                                      color: theme.text,
                                    }}
                                    numberOfLines={1}
                                  >
                                    {item.full_name || item.username}
                                  </Text>
                                  <Text style={{ fontSize: 11, color: theme.textMuted }}>
                                    {formatDate(item.updated_at)}
                                  </Text>
                                </View>

                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                  <Text numberOfLines={1} style={{ fontSize: 11, color: theme.textMuted, flexShrink: 1 }}>
                                    @{item.username}
                                  </Text>
                                  {item.is_dispute && (
                                    <View
                                      style={{
                                        paddingHorizontal: 5,
                                        paddingVertical: 1,
                                        borderRadius: 4,
                                        backgroundColor: 'rgba(239,68,68,0.15)',
                                      }}
                                    >
                                      <Text style={{ fontSize: 9, fontWeight: '800', color: theme.danger }}>
                                        DISPUTE
                                      </Text>
                                    </View>
                                  )}
                                </View>
                              </View>
                            </View>

                            <Text
                              style={{
                                fontSize: 12,
                                color: isSelected ? theme.text : theme.textMuted,
                                lineHeight: 16,
                                marginTop: 4,
                              }}
                              numberOfLines={2}
                            >
                              {(item.last_message || 'Inquiry initiated').replace(/\*\*/g, '')}
                            </Text>
                          </Pressable>
                        );
                      }}
                    />
                  </View>
                )}

                {/* Chat Workbench Column */}
                {(selectedSupportConv || isDesktop) && (
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: theme.panel,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: theme.border,
                      overflow: 'hidden',
                      display: !isDesktop && !selectedSupportConv ? 'none' : 'flex',
                    }}
                  >
                    {selectedSupportConv ? (
                      <View style={{ flex: 1 }}>
                        {/* Chat Header */}
                        <View
                          style={{
                            height: 58,
                            paddingHorizontal: 16,
                            borderBottomWidth: 1,
                            borderBottomColor: theme.border,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: theme.panel,
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            {!isDesktop && (
                              <Pressable
                                onPress={() => setSelectedSupportConv(null)}
                                hitSlop={8}
                                style={{ marginRight: 4 }}
                              >
                                <Feather name="arrow-left" size={20} color={theme.text} />
                              </Pressable>
                            )}

                            <View
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: 17,
                                backgroundColor: theme.surface,
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden',
                              }}
                            >
                              {selectedSupportConv.avatar_url ? (
                                <Image
                                  source={{ uri: getOptimizedImageUrl(selectedSupportConv.avatar_url, { width: 68 }) }}
                                  style={{ width: 34, height: 34 }}
                                  contentFit="cover"
                                />
                              ) : (
                                <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>
                                  {(selectedSupportConv.full_name || selectedSupportConv.username || 'U').charAt(0).toUpperCase()}
                                </Text>
                              )}
                            </View>

                            <View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>
                                  {selectedSupportConv.full_name || selectedSupportConv.username}
                                </Text>
                                {selectedSupportConv.is_dispute && (
                                  <View
                                    style={{
                                      paddingHorizontal: 6,
                                      paddingVertical: 1,
                                      borderRadius: 4,
                                      backgroundColor: 'rgba(239,68,68,0.15)',
                                    }}
                                  >
                                    <Text style={{ fontSize: 10, fontWeight: '800', color: theme.danger }}>
                                      DISPUTE TICKET
                                    </Text>
                                  </View>
                                )}
                              </View>
                              <Text style={{ fontSize: 11, color: theme.textMuted }}>
                                @{selectedSupportConv.username}
                              </Text>
                            </View>
                          </View>

                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Pressable
                              onPress={() => loadSupportMessages(selectedSupportConv.id)}
                              hitSlop={8}
                              style={({ pressed }) => ({
                                width: 32,
                                height: 32,
                                borderRadius: 6,
                                borderWidth: 1,
                                borderColor: theme.border,
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: pressed ? 0.7 : 1,
                              })}
                            >
                              <Feather name="refresh-cw" size={13} color={theme.text} />
                            </Pressable>

                            <Pressable
                              onPress={() => router.push(`/user/${selectedSupportConv.user_id}` as any)}
                              hitSlop={8}
                              style={({ pressed }) => ({
                                height: 32,
                                paddingHorizontal: 10,
                                borderRadius: 6,
                                borderWidth: 1,
                                borderColor: theme.border,
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexDirection: 'row',
                                gap: 6,
                                opacity: pressed ? 0.7 : 1,
                              })}
                            >
                              <Feather name="external-link" size={13} color={theme.text} />
                              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text }}>Profile</Text>
                            </Pressable>
                          </View>
                        </View>

                        {/* Messages Thread */}
                        {loadingSupportMessages ? (
                          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                            <ActivityIndicator size="small" color={theme.text} />
                            <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 8 }}>
                              Loading conversation...
                            </Text>
                          </View>
                        ) : (
                          <ScrollView
                            // Open at the newest message, and follow new ones as they arrive.
                            onContentSizeChange={(_, h) => supportScrollRef.current?.scrollTo({ y: h, animated: false })}
                            ref={supportScrollRef}
                            style={{ flex: 1, padding: 16 }}
                            contentContainerStyle={{ gap: 12, paddingBottom: 20 }}
                            showsVerticalScrollIndicator={true}
                          >
                            {supportMessages.length === 0 ? (
                              <View style={{ padding: 40, alignItems: 'center' }}>
                                <Text style={{ fontSize: 13, color: theme.textMuted }}>
                                  No messages found in this support conversation.
                                </Text>
                              </View>
                            ) : (
                              supportMessages.map((msg) => {
                                // Sender only: any user can set message metadata,
                                // so it must not decide what counts as "support".
                                const isSupport = msg.sender_id === SUPPORT_BOT_USER_ID;
                                return (
                                  <View
                                    key={msg.id}
                                    style={{
                                      alignSelf: isSupport ? 'flex-end' : 'flex-start',
                                      maxWidth: isDesktop ? '75%' : '88%',
                                    }}
                                  >
                                    <View
                                      style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 6,
                                        marginBottom: 4,
                                        alignSelf: isSupport ? 'flex-end' : 'flex-start',
                                      }}
                                    >
                                      {isSupport ? (
                                        <>
                                          <Text style={{ fontSize: 11, fontWeight: '700', color: theme.purple }}>
                                            Grabsty Support
                                          </Text>
                                          <ShieldCheckIcon size={12} />
                                        </>
                                      ) : (
                                        <Text style={{ fontSize: 11, fontWeight: '600', color: theme.textMuted }}>
                                          @{selectedSupportConv.username}
                                        </Text>
                                      )}
                                      <Text style={{ fontSize: 10, color: theme.textMuted }}>
                                        {formatDate(msg.created_at)}
                                      </Text>
                                    </View>

                                    <View
                                      style={{
                                        backgroundColor: isSupport
                                          ? theme.ink
                                          : theme.surface,
                                        borderRadius: 12,
                                        paddingHorizontal: 14,
                                        paddingVertical: 10,
                                        borderWidth: isSupport ? 0 : 1,
                                        borderColor: theme.border,
                                      }}
                                    >
                                      <Text
                                        style={{
                                          fontSize: 13,
                                          lineHeight: 18,
                                          color: isSupport ? theme.background : theme.text,
                                        }}
                                      >
                                        {msg.content}
                                      </Text>
                                    </View>
                                  </View>
                                );
                              })
                            )}
                          </ScrollView>
                        )}

                        {/* Quick Canned Responses */}
                        <View
                          style={{
                            paddingHorizontal: 14,
                            paddingTop: 8,
                            paddingBottom: 4,
                            borderTopWidth: 1,
                            borderTopColor: theme.border,
                            backgroundColor: theme.panel,
                          }}
                        >
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                            {[
                              '🚨 We are reviewing your order dispute and will update you shortly.',
                              '✅ Your dispute has been resolved and refund processed to your account.',
                              '📦 Please provide clear photos of the packaging and item received.',
                              '👋 Hello! How can our support team assist you today?',
                            ].map((canned, idx) => (
                              <Pressable
                                key={idx}
                                onPress={() => {
                                  tap('light');
                                  setAdminReplyText(canned);
                                }}
                                style={({ pressed }) => ({
                                  paddingHorizontal: 10,
                                  height: 26,
                                  borderRadius: 13,
                                  backgroundColor: theme.surface,
                                  borderWidth: 1,
                                  borderColor: theme.border,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  opacity: pressed ? 0.7 : 1,
                                })}
                              >
                                <Text style={{ fontSize: 11, color: theme.textMuted }} numberOfLines={1}>
                                  {canned.slice(0, 32)}…
                                </Text>
                              </Pressable>
                            ))}
                          </ScrollView>
                        </View>

                        {/* Reply Composer */}
                        <View
                          style={{
                            padding: 12,
                            backgroundColor: theme.panel,
                            flexDirection: 'row',
                            alignItems: 'flex-end',
                            gap: 10,
                          }}
                        >
                          <TextInput
                            value={adminReplyText}
                            onChangeText={setAdminReplyText}
                            placeholder="Reply to user as Grabsty Support Team..."
                            placeholderTextColor={theme.textMuted}
                            multiline
                            style={{
                              flex: 1,
                              minHeight: 40,
                              maxHeight: 120,
                              backgroundColor: theme.surface,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: theme.border,
                              paddingHorizontal: 12,
                              paddingVertical: 10,
                              fontSize: 13,
                              color: theme.text,
                            }}
                          />

                          <Pressable
                            disabled={!adminReplyText.trim() || sendingAdminReply}
                            onPress={handleSendAdminReply}
                            style={({ pressed }) => ({
                              height: 40,
                              paddingHorizontal: 16,
                              borderRadius: 8,
                              backgroundColor: theme.ink,
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexDirection: 'row',
                              gap: 6,
                              opacity: pressed || !adminReplyText.trim() || sendingAdminReply ? 0.6 : 1,
                            })}
                          >
                            {sendingAdminReply ? (
                              <ActivityIndicator size="small" color={theme.background} />
                            ) : (
                              <>
                                <Feather name="send" size={14} color={theme.background} />
                                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.background }}>
                                  Send
                                </Text>
                              </>
                            )}
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      /* Empty State when no conversation is selected on desktop */
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
                        <View
                          style={{
                            width: 64,
                            height: 64,
                            borderRadius: 32,
                            backgroundColor: theme.surface,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: 16,
                          }}
                        >
                          <Feather name="message-square" size={28} color={theme.textMuted} />
                        </View>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 6 }}>
                          Select a Support Inquiry
                        </Text>
                        <Text style={{ fontSize: 13, color: theme.textMuted, textAlign: 'center', maxWidth: 360, lineHeight: 18 }}>
                          Choose any conversation from the list to view live message history and personally respond to buyers and sellers as Grabsty Support.
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </View>
          )}
        </View>
      </View>

      {/* DISPATCH UPDATE MODAL */}
      <Modal visible={showDispatchModal} transparent animationType="fade" onRequestClose={() => setShowDispatchModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 440, backgroundColor: theme.panel, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: theme.border }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: theme.text, marginBottom: 4 }}>
              Update Courier Dispatch
            </Text>
            <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: 16 }}>
              Order #{selectedTx ? deriveRef(selectedTx.id) : ''}
            </Text>

            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textMuted, marginBottom: 6 }}>Courier Partner</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {COURIER_PRESETS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setSelectedCourier(c)}
                  style={{
                    paddingHorizontal: 10,
                    height: 28,
                    borderRadius: 6,
                    backgroundColor: selectedCourier === c ? theme.ink : theme.surface,
                    borderWidth: 1,
                    borderColor: selectedCourier === c ? theme.ink : theme.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: selectedCourier === c ? theme.background : theme.text }}>
                    {c}
                  </Text>
                </Pressable>
              ))}
            </View>

            {selectedCourier === 'Custom' && (
              <TextInput
                value={customCourier}
                onChangeText={setCustomCourier}
                placeholder="Enter custom courier name"
                placeholderTextColor={theme.textMuted}
                style={{ height: 38, borderRadius: 8, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, fontSize: 13, color: theme.text, marginBottom: 14 }}
              />
            )}

            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textMuted, marginBottom: 6 }}>Tracking Number / Airway Bill</Text>
            <TextInput
              value={trackingNumber}
              onChangeText={setTrackingNumber}
              placeholder="e.g. TRK-982183921"
              placeholderTextColor={theme.textMuted}
              style={{ height: 38, borderRadius: 8, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, fontSize: 13, color: theme.text, marginBottom: 14 }}
            />

            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textMuted, marginBottom: 6 }}>Logistics Notes (Internal)</Text>
            <TextInput
              value={actionNotes}
              onChangeText={setActionNotes}
              placeholder="Dispatch notes or pickup schedule details"
              placeholderTextColor={theme.textMuted}
              style={{ height: 38, borderRadius: 8, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, fontSize: 13, color: theme.text, marginBottom: 20 }}
            />

            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
              <Pressable
                onPress={() => setShowDispatchModal(false)}
                style={({ pressed }) => ({
                  height: 38,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textMuted }}>Cancel</Text>
              </Pressable>

              <Pressable
                disabled={submittingAction}
                onPress={() => {
                  if (selectedTx) {
                    handleAdvanceStatus(selectedTx.status, {
                      courier: selectedCourier === 'Custom' ? customCourier : selectedCourier,
                      trackingNumber,
                      notes: actionNotes,
                    });
                  }
                }}
                style={({ pressed }) => ({
                  height: 38,
                  paddingHorizontal: 18,
                  borderRadius: 8,
                  backgroundColor: theme.ink,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed || submittingAction ? 0.75 : 1,
                })}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.background }}>
                  {submittingAction ? 'Saving…' : 'Save Dispatch'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* DISPUTE RESOLUTION MODAL */}
      <Modal visible={showDisputeModal} transparent animationType="fade" onRequestClose={() => setShowDisputeModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 440, backgroundColor: theme.panel, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: theme.border }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: theme.text, marginBottom: 4 }}>
              Resolve Escrow Dispute
            </Text>
            <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: 16 }}>
              Order #{selectedTx ? deriveRef(selectedTx.id) : ''} · {formatPrice((selectedTx?.order?.amount_cents || selectedTx?.amount_cents || 0) / 100)}
            </Text>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              <Pressable
                onPress={() => setDisputeResolutionType('release_to_seller')}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 8,
                  borderWidth: 1.5,
                  borderColor: disputeResolutionType === 'release_to_seller' ? '#10B981' : theme.border,
                  backgroundColor: disputeResolutionType === 'release_to_seller' ? 'rgba(16,185,129,0.08)' : theme.surface,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: disputeResolutionType === 'release_to_seller' ? '#10B981' : theme.text }}>
                  Release to Seller
                </Text>
                <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>Payout proceeds to seller wallet/bank</Text>
              </Pressable>

              <Pressable
                onPress={() => setDisputeResolutionType('refund_buyer')}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 8,
                  borderWidth: 1.5,
                  borderColor: disputeResolutionType === 'refund_buyer' ? theme.danger : theme.border,
                  backgroundColor: disputeResolutionType === 'refund_buyer' ? 'rgba(239,68,68,0.08)' : theme.surface,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: disputeResolutionType === 'refund_buyer' ? theme.danger : theme.text }}>
                  Refund Buyer
                </Text>
                <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>Reverse charge and refund payment</Text>
              </Pressable>
            </View>

            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textMuted, marginBottom: 6 }}>Resolution Findings & Notes</Text>
            <TextInput
              value={disputeNotes}
              onChangeText={setDisputeNotes}
              placeholder="Provide adjudication rationale for the audit trail"
              placeholderTextColor={theme.textMuted}
              multiline
              numberOfLines={3}
              style={{ minHeight: 70, borderRadius: 8, borderWidth: 1, borderColor: theme.border, padding: 10, fontSize: 13, color: theme.text, marginBottom: 20 }}
            />

            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
              <Pressable
                onPress={() => setShowDisputeModal(false)}
                style={({ pressed }) => ({
                  height: 38,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textMuted }}>Cancel</Text>
              </Pressable>

              <Pressable
                disabled={submittingAction}
                onPress={handleResolveDispute}
                style={({ pressed }) => ({
                  height: 38,
                  paddingHorizontal: 18,
                  borderRadius: 8,
                  backgroundColor: disputeResolutionType === 'release_to_seller' ? '#10B981' : theme.danger,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed || submittingAction ? 0.75 : 1,
                })}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
                  {submittingAction ? 'Executing…' : 'Execute Adjudication'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      </KeyboardAvoider>
    </SafeAreaView>
  );
}
