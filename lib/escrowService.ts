import { supabase } from '@/lib/supabase';
import type { EscrowStatus, Transaction, TransactionEventLog, Order } from '@/types';

export const ESCROW_TRANSITION_MAP: Record<EscrowStatus, EscrowStatus[]> = {
  PENDING_PAYMENT: ['PAYMENT_SECURED_ESCROW', 'CANCELLED'],
  PAYMENT_SECURED_ESCROW: ['READY_FOR_PICKUP', 'CANCELLED'],
  READY_FOR_PICKUP: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED', 'DISPUTED'],
  DELIVERED: ['COMPLETED_FUNDS_RELEASED', 'DISPUTED'],
  DISPUTED: ['COMPLETED_FUNDS_RELEASED', 'CANCELLED'],
  COMPLETED_FUNDS_RELEASED: [],
  CANCELLED: [],
};

export function canAdvanceEscrow(from: EscrowStatus, to: EscrowStatus): boolean {
  const allowed = ESCROW_TRANSITION_MAP[from] || [];
  return allowed.includes(to);
}

export interface EscrowStatusStyle {
  label: string;
  bg: string;
  color: string;
  dotColor: string;
  icon: string;
}

export function getEscrowStatusStyle(status: EscrowStatus): EscrowStatusStyle {
  switch (status) {
    case 'PENDING_PAYMENT':
      return {
        label: 'Awaiting Payment',
        bg: 'rgba(234, 179, 8, 0.12)',
        color: '#FACC15',
        dotColor: '#FACC15',
        icon: 'clock',
      };
    case 'PAYMENT_SECURED_ESCROW':
      return {
        label: 'Secured in Escrow',
        bg: 'rgba(108, 71, 255, 0.14)',
        color: '#A78BFA',
        dotColor: '#8B5CF6',
        icon: 'shield',
      };
    case 'READY_FOR_PICKUP':
      return {
        label: 'Ready for Pickup',
        bg: 'rgba(245, 158, 11, 0.14)',
        color: '#FBBF24',
        dotColor: '#F59E0B',
        icon: 'package',
      };
    case 'IN_TRANSIT':
      return {
        label: 'In Transit',
        bg: 'rgba(59, 130, 246, 0.14)',
        color: '#60A5FA',
        dotColor: '#3B82F6',
        icon: 'truck',
      };
    case 'DELIVERED':
      return {
        label: 'Delivered (24h Window)',
        bg: 'rgba(16, 185, 129, 0.14)',
        color: '#34D399',
        dotColor: '#10B981',
        icon: 'check-circle',
      };
    case 'COMPLETED_FUNDS_RELEASED':
      return {
        label: 'Funds Released',
        bg: 'rgba(16, 185, 129, 0.22)',
        color: '#10B981',
        dotColor: '#059669',
        icon: 'dollar-sign',
      };
    case 'DISPUTED':
      return {
        label: 'Disputed',
        bg: 'rgba(239, 68, 68, 0.14)',
        color: '#F87171',
        dotColor: '#EF4444',
        icon: 'alert-triangle',
      };
    case 'CANCELLED':
      return {
        label: 'Cancelled',
        bg: 'rgba(156, 163, 175, 0.12)',
        color: '#9CA3AF',
        dotColor: '#6B7280',
        icon: 'x-circle',
      };
    default:
      return {
        label: status,
        bg: 'rgba(255, 255, 255, 0.08)',
        color: '#E5E7EB',
        dotColor: '#9CA3AF',
        icon: 'info',
      };
  }
}

export interface AdvanceEscrowParams {
  orderId: string;
  targetStatus: EscrowStatus;
  notes?: string | null;
  courier?: string | null;
  trackingNumber?: string | null;
  disputeReason?: string | null;
  cancelReason?: string | null;
}

export interface EscrowLogisticsItem extends Omit<Transaction, 'order'> {
  order?: (Order & {
    order_seller_pickups?: { pickup_address: any }[] | { pickup_address: any } | null;
  }) | null;
}

export const escrowService = {
  /**
   * Advance an escrow transaction to a new state atomically via PostgreSQL RPC.
   */
  async advanceStatus(params: AdvanceEscrowParams): Promise<Transaction> {
    const { data, error } = await supabase.rpc('advance_escrow_status', {
      p_order_id: params.orderId,
      p_target_status: params.targetStatus,
      p_notes: params.notes || null,
      p_courier: params.courier || null,
      p_tracking_number: params.trackingNumber || null,
      p_dispute_reason: params.disputeReason || null,
      p_cancel_reason: params.cancelReason || null,
    });

    if (error) {
      throw new Error(error.message || 'Failed to update escrow transaction state');
    }

    return data as Transaction;
  },

  /**
   * Fetch transactions for the admin logistics operations dashboard.
   */
  async fetchLogisticsTransactions(
    tabFilter: string = 'active',
    limit: number = 60,
  ): Promise<EscrowLogisticsItem[]> {
    let query = supabase
      .from('transactions')
      .select(`
        *,
        listing:listings(id, title, price, images, brand, category),
        buyer:profiles!transactions_buyer_id_fkey(id, username, full_name, avatar_url),
        seller:profiles!transactions_seller_id_fkey(id, username, full_name, avatar_url),
        order:orders!transactions_order_id_fkey(
          *,
          order_seller_pickups(pickup_address)
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    // Apply Tab Filters
    if (tabFilter === 'active') {
      // Primary view requested: PAYMENT_SECURED_ESCROW or IN_TRANSIT, plus READY_FOR_PICKUP
      query = query.in('status', ['PAYMENT_SECURED_ESCROW', 'READY_FOR_PICKUP', 'IN_TRANSIT']);
    } else if (tabFilter === 'escrow_secured') {
      query = query.eq('status', 'PAYMENT_SECURED_ESCROW');
    } else if (tabFilter === 'ready_for_pickup') {
      query = query.eq('status', 'READY_FOR_PICKUP');
    } else if (tabFilter === 'in_transit') {
      query = query.eq('status', 'IN_TRANSIT');
    } else if (tabFilter === 'delivered') {
      query = query.eq('status', 'DELIVERED');
    } else if (tabFilter === 'completed') {
      query = query.eq('status', 'COMPLETED_FUNDS_RELEASED');
    } else if (tabFilter === 'disputed') {
      query = query.eq('status', 'DISPUTED');
    } else if (tabFilter === 'cancelled') {
      query = query.eq('status', 'CANCELLED');
    }
    // 'all' applies no status filter

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message || 'Failed to fetch logistics transactions');
    }

    return (data || []) as EscrowLogisticsItem[];
  },

  /**
   * Fetch immutable audit logs for a transaction.
   */
  async fetchEventLogs(transactionId: string): Promise<TransactionEventLog[]> {
    const { data, error } = await supabase
      .from('transaction_event_logs')
      .select('*')
      .eq('transaction_id', transactionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('[escrowService] fetchEventLogs error', error);
      return [];
    }

    return (data || []) as TransactionEventLog[];
  },
};
