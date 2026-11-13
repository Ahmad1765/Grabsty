import { describe, it, expect } from 'vitest';
import { orderTotal, buyerProtectionFee } from '@/lib/fees';
import { computeCheckoutItemPrice } from '@/lib/bundle';
import { OFFER_TTL_MS } from '@/components/product/offerHelpers';

describe('Chat-to-Order Bridge & Offer Lifecycle', () => {
  describe('24-hour Offer TTL Expiration', () => {
    const isOfferExpired = (msg: { offer_status?: string | null; created_at?: string }) => {
      if (msg.offer_status === 'expired') return true;
      if ((msg.offer_status === 'pending' || msg.offer_status === 'proposed') && msg.created_at) {
        const ageMs = Date.now() - new Date(msg.created_at).getTime();
        return ageMs > OFFER_TTL_MS;
      }
      return false;
    };

    it('keeps offers under 24h active and pending', () => {
      const recent = new Date(Date.now() - 2 * 3600 * 1000).toISOString(); // 2h ago
      expect(isOfferExpired({ offer_status: 'pending', created_at: recent })).toBe(false);
      expect(isOfferExpired({ offer_status: 'proposed', created_at: recent })).toBe(false);
    });

    it('automatically treats offers older than 24h as expired', () => {
      const old = new Date(Date.now() - 25 * 3600 * 1000).toISOString(); // 25h ago
      expect(isOfferExpired({ offer_status: 'pending', created_at: old })).toBe(true);
      expect(isOfferExpired({ offer_status: 'proposed', created_at: old })).toBe(true);
    });

    it('does not expire accepted or declined offers regardless of age', () => {
      const ancient = new Date(Date.now() - 100 * 3600 * 1000).toISOString();
      expect(isOfferExpired({ offer_status: 'accepted', created_at: ancient })).toBe(false);
      expect(isOfferExpired({ offer_status: 'declined', created_at: ancient })).toBe(false);
    });
  });

  describe('Decoupled canPay & awaitingPayment on Accepted Offers', () => {
    const deriveOfferActions = (args: {
      isSeller: boolean;
      status: string;
      listingId: string | null;
      listingSold: boolean;
      isPaid: boolean;
      isBundleInvalid: boolean;
    }) => {
      const canPay =
        !args.isSeller &&
        args.status === 'accepted' &&
        !!args.listingId &&
        !args.isPaid &&
        !args.isBundleInvalid;

      const awaitingPayment =
        args.isSeller &&
        args.status === 'accepted' &&
        !args.isPaid &&
        !args.isBundleInvalid;

      return { canPay, awaitingPayment };
    };

    it('allows buyer to pay even when listingSold is true because offer acceptance locked inventory', () => {
      const actions = deriveOfferActions({
        isSeller: false,
        status: 'accepted',
        listingId: 'listing-123',
        listingSold: true, // locked by accept_chat_offer RPC
        isPaid: false,
        isBundleInvalid: false,
      });

      expect(actions.canPay).toBe(true);
      expect(actions.awaitingPayment).toBe(false);
    });

    it('shows awaitingPayment to seller even when listingSold is true', () => {
      const actions = deriveOfferActions({
        isSeller: true,
        status: 'accepted',
        listingId: 'listing-123',
        listingSold: true,
        isPaid: false,
        isBundleInvalid: false,
      });

      expect(actions.canPay).toBe(false);
      expect(actions.awaitingPayment).toBe(true);
    });

    it('disables canPay once order has been paid', () => {
      const actions = deriveOfferActions({
        isSeller: false,
        status: 'accepted',
        listingId: 'listing-123',
        listingSold: true,
        isPaid: true,
        isBundleInvalid: false,
      });

      expect(actions.canPay).toBe(false);
      expect(actions.awaitingPayment).toBe(false);
    });
  });

  describe('Checkout Calculation with In-Chat Offer Price', () => {
    it('computes exact checkout price and fees locked to accepted offer amount', () => {
      const listingPrice = 5000;
      const acceptedOffer = 4200;

      const itemPrice = computeCheckoutItemPrice({
        offerAmount: acceptedOffer,
        isBundle: false,
        bundleCalculationTotal: undefined,
        listingPrice,
      });

      expect(itemPrice).toBe(4200);

      const bpFee = buyerProtectionFee(itemPrice);
      const total = orderTotal(itemPrice);

      expect(total).toBe(4200 + bpFee);
    });
  });

  describe('Product Screen Action Bar Awaiting Payment State', () => {
    const deriveProductBarState = (
      order: { status: string; amount_cents?: number } | null,
      listingSold = false,
    ) => {
      const isSold = listingSold || Boolean(order && order.status !== 'awaiting_payment');
      const isAwaitingPayment = Boolean(order && order.status === 'awaiting_payment' && !listingSold);
      const hasPurchased = Boolean(order && order.status !== 'awaiting_payment');
      const awaitingAmount = isAwaitingPayment && order?.amount_cents
        ? Math.round(order.amount_cents / 100)
        : undefined;

      return { isSold, isAwaitingPayment, hasPurchased, awaitingAmount };
    };

    it('renders awaiting payment with checkout CTA when order is awaiting_payment without marking listing as sold', () => {
      const state = deriveProductBarState({
        status: 'awaiting_payment',
        amount_cents: 350000,
      });

      expect(state.isSold).toBe(false);
      expect(state.isAwaitingPayment).toBe(true);
      expect(state.hasPurchased).toBe(false);
      expect(state.awaitingAmount).toBe(3500);
    });

    it('renders hasPurchased and isSold track order state when order is paid or pending', () => {
      const statePaid = deriveProductBarState({
        status: 'paid',
        amount_cents: 350000,
      });

      expect(statePaid.isSold).toBe(true);
      expect(statePaid.isAwaitingPayment).toBe(false);
      expect(statePaid.hasPurchased).toBe(true);
    });
  });

  describe('Counter-Offer Card Presentation & Counterparty Authorization', () => {
    const shouldShowIncomingOfferCard = (args: {
      mine: boolean;
      status: string;
      listingSold: boolean;
      isBundleInvalid: boolean;
      isActionable?: boolean;
    }) => {
      const isActionable = args.isActionable !== false;
      return (
        !args.mine &&
        (args.status === 'pending' || args.status === 'proposed') &&
        !args.listingSold &&
        !args.isBundleInvalid &&
        isActionable
      );
    };

    const deriveOfferBadgeLabel = (msg: { parent_offer_id?: string | null; metadata?: { parent_offer_id?: string } }) => {
      const isCounter = Boolean(msg.metadata?.parent_offer_id || msg.parent_offer_id);
      return isCounter ? 'Counter-offer received' : 'Offer received';
    };

    const deriveCounteredPillText = (isMine: boolean) => {
      return isMine ? 'Your offer was countered' : 'You countered this offer';
    };

    const canAcceptOffer = (args: {
      callerId: string;
      buyerId: string;
      sellerId: string;
      senderId: string;
      isAdmin?: boolean;
    }) => {
      if (args.isAdmin) return true;
      if (args.callerId !== args.buyerId && args.callerId !== args.sellerId) return false;
      if (args.callerId === args.senderId) return false;
      return true;
    };

    it('displays IncomingOfferCard to buyer receiving seller counter-offer (!mine regardless of isSeller)', () => {
      expect(
        shouldShowIncomingOfferCard({
          mine: false,
          status: 'pending',
          listingSold: false,
          isBundleInvalid: false,
        }),
      ).toBe(true);
    });

    it('does not display IncomingOfferCard to sender (mine: true)', () => {
      expect(
        shouldShowIncomingOfferCard({
          mine: true,
          status: 'pending',
          listingSold: false,
          isBundleInvalid: false,
        }),
      ).toBe(false);
    });

    it('derives Counter-offer received when linked to a parent offer', () => {
      expect(deriveOfferBadgeLabel({ parent_offer_id: 'msg-parent-123' })).toBe('Counter-offer received');
      expect(deriveOfferBadgeLabel({ metadata: { parent_offer_id: 'msg-parent-456' } })).toBe('Counter-offer received');
      expect(deriveOfferBadgeLabel({})).toBe('Offer received');
    });

    it('derives clear countered pill text for both parties once superseded', () => {
      expect(deriveCounteredPillText(true)).toBe('Your offer was countered');
      expect(deriveCounteredPillText(false)).toBe('You countered this offer');
    });

    it('allows buyer to accept a seller counter-offer and blocks sender from accepting their own offer', () => {
      const buyerId = 'user-buyer';
      const sellerId = 'user-seller';

      // 1. Seller counters offer (seller is sender) -> buyer can accept
      expect(canAcceptOffer({ callerId: buyerId, buyerId, sellerId, senderId: sellerId })).toBe(true);

      // 2. Seller cannot accept their own counter-offer
      expect(canAcceptOffer({ callerId: sellerId, buyerId, sellerId, senderId: sellerId })).toBe(false);

      // 3. Buyer makes initial offer (buyer is sender) -> seller can accept
      expect(canAcceptOffer({ callerId: sellerId, buyerId, sellerId, senderId: buyerId })).toBe(true);

      // 4. Buyer cannot accept their own initial offer
      expect(canAcceptOffer({ callerId: buyerId, buyerId, sellerId, senderId: buyerId })).toBe(false);

      // 5. Unrelated user cannot accept
      expect(canAcceptOffer({ callerId: 'intruder', buyerId, sellerId, senderId: sellerId })).toBe(false);

      // 6. Admin can accept
      expect(canAcceptOffer({ callerId: 'admin-id', buyerId, sellerId, senderId: sellerId, isAdmin: true })).toBe(true);
    });
  });
});
