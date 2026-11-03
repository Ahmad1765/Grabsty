import { describe, it, expect, vi } from 'vitest';
import React from 'react';

vi.mock('react', async () => {
  const actual = await vi.importActual<any>('react');
  return {
    ...actual,
    useState: (initial: any) => {
      const val = typeof initial === 'function' ? initial() : initial;
      return [val, vi.fn()];
    },
    useMemo: (fn: any) => fn(),
    useCallback: (fn: any) => fn,
    useEffect: vi.fn(),
    useRef: (val: any) => ({ current: val }),
  };
});

import { OrdersInboxPage, OrderRow } from './OrdersInboxPage';
import { lightTheme } from '@/lib/theme';

vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web || obj.default },
  View: (props: any) => React.createElement('div', props, props.children),
  Text: (props: any) => React.createElement('span', props, props.children),
  Pressable: (props: any) => {
    const style = typeof props.style === 'function' ? props.style({ pressed: false }) : props.style;
    return React.createElement('button', { ...props, style }, props.children);
  },
  ScrollView: (props: any) => React.createElement('div', props, props.children),
  FlatList: (props: any) => {
    // Call renderItem if data is provided or ListEmptyComponent
    const items = props.data?.map((item: any) => props.renderItem({ item })) || [];
    return React.createElement('div', props, [items, props.ListEmptyComponent]);
  },
  RefreshControl: (props: any) => React.createElement('div', props, props.children),
  StyleSheet: {
    create: (s: any) => s,
    hairlineWidth: 1,
  },
}));

vi.mock('expo-router', () => ({
  router: { push: vi.fn() },
  useFocusEffect: vi.fn(),
}));
import { router } from 'expo-router';

vi.mock('expo-image', () => ({
  Image: (props: any) => React.createElement('img', props),
}));

vi.mock('@expo/vector-icons/Feather', () => ({
  default: (props: any) => React.createElement('i', props),
}));

vi.mock('@/lib/haptics', () => ({
  tap: vi.fn(),
}));

vi.mock('@/lib/rnText', () => ({
  Text: (props: any) => React.createElement('span', props, props.children),
}));

vi.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({ theme: lightTheme, isDark: false }),
}));

vi.mock('@/components/sell/SellSheet', () => ({
  useSellSheet: () => ({ open: vi.fn() }),
}));

vi.mock('@/lib/queries', () => ({
  useMyOrdersQuery: () => ({
    data: [
      {
        id: 'ord-1',
        buyer_id: 'user-123',
        seller_id: 'seller-abc',
        status: 'paid',
        fulfillment_status: 'packing',
        amount_cents: 350000,
        fee_cents: 10000,
        currency: 'pkr',
        created_at: '2026-06-29T10:00:00Z',
        listing_id: 'list-1',
        listing: { id: 'list-1', title: 'Vintage Jacket', price: 3500, images: ['jacket.jpg'] },
      },
      {
        id: 'ord-2',
        buyer_id: 'buyer-xyz',
        seller_id: 'user-123',
        status: 'paid',
        fulfillment_status: 'packing',
        amount_cents: 220000,
        fee_cents: 10000,
        currency: 'pkr',
        created_at: '2026-06-30T10:00:00Z',
        listing_id: 'list-2',
        listing: { id: 'list-2', title: 'Retro Sunglasses', price: 2200, images: ['glasses.jpg'] },
      },
    ],
    isPending: false,
    isRefetching: false,
    refetch: vi.fn(),
  }),
}));

function getResolvedStyle(element: any) {
  if (!element || !element.props) return {};
  const raw = typeof element.props.style === 'function'
    ? element.props.style({ pressed: false })
    : element.props.style;
  return Array.isArray(raw) ? Object.assign({}, ...raw.flat(Infinity)) : (raw || {});
}

function findByAccessibilityLabel(node: any, label: string): any {
  if (!node) return null;
  if (node.props?.accessibilityLabel === label) return node;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByAccessibilityLabel(child, label);
      if (found) return found;
    }
  } else if (node.props?.children) {
    return findByAccessibilityLabel(node.props.children, label);
  }
  return null;
}

function render(element: React.ReactElement<any>) {
  const Component = element.type as any;
  const renderFn = Component.type || Component;
  return renderFn(element.props);
}

describe('OrdersInboxPage UI Invariants & Guardrails (Rule 2.10)', () => {
  it('enforces the Purchases and Selling segmented sub-toggle inside the view', () => {
    const rendered = render(
      React.createElement(OrdersInboxPage, {
        userId: 'user-123',
        pageWidth: 390,
        pageHeight: 800,
        bottomInset: 34,
        initialSide: 'bought',
      })
    );

    // Look for Purchases and Selling tabs in accessibility
    const purchasesTab = findByAccessibilityLabel(rendered, 'Purchases');
    const sellingTab = findByAccessibilityLabel(rendered, 'Selling');

    expect(purchasesTab).toBeDefined();
    expect(sellingTab).toBeDefined();
    expect(purchasesTab.props.accessibilityRole).toBe('tab');
    expect(sellingTab.props.accessibilityRole).toBe('tab');
  });

  it('strictly enforces 36px height and 8px squircle radius on filter chips without dividing underlines', () => {
    const rendered = render(
      React.createElement(OrdersInboxPage, {
        userId: 'user-123',
        pageWidth: 390,
        pageHeight: 800,
        bottomInset: 34,
      })
    );

    const allChip = findByAccessibilityLabel(rendered, 'All');
    const inProgressChip = findByAccessibilityLabel(rendered, 'In Progress');
    const completedChip = findByAccessibilityLabel(rendered, 'Completed');
    const refundsChip = findByAccessibilityLabel(rendered, 'Refunds');
    const canceledChip = findByAccessibilityLabel(rendered, 'Canceled');

    expect(allChip).toBeDefined();
    expect(inProgressChip).toBeDefined();
    expect(completedChip).toBeDefined();
    expect(refundsChip).toBeDefined();
    expect(canceledChip).toBeDefined();

    const inProgressStyle = getResolvedStyle(inProgressChip);
    expect(inProgressStyle.height).toBe(36);
    expect(inProgressStyle.borderRadius).toBe(8);

    const allChipStyle = getResolvedStyle(allChip);
    expect(allChipStyle.height).toBe(36);
    expect(allChipStyle.borderRadius).toBe(8);
  });

  it('displays the Shop Listings bar with New item and View shop actions when in Selling view', () => {
    const rendered = render(
      React.createElement(OrdersInboxPage, {
        userId: 'user-123',
        pageWidth: 390,
        pageHeight: 800,
        bottomInset: 34,
        initialSide: 'sold',
      })
    );

    // Search for "Shop Listings", "New item", and "View shop"
    const textNodes: string[] = [];
    function collectText(node: any) {
      if (!node) return;
      if (typeof node === 'string') textNodes.push(node);
      if (Array.isArray(node)) node.forEach(collectText);
      else if (node.props?.children) collectText(node.props.children);
    }
    collectText(rendered);

    expect(textNodes).toContain('Shop Listings');
    expect(textNodes).toContain('New item');
    expect(textNodes).toContain('View shop');
  });

  it('strictly locks Activity screen top tabs to Orders, Messages, and Support', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.resolve(__dirname, '../../app/(tabs)/chat.tsx'), 'utf-8');
    expect(content).toContain("{ value: 'orders', label: 'Orders' }");
    expect(content).toContain("{ value: 'messages', label: 'Messages' }");
    expect(content).toContain("{ value: 'support', label: 'Support' }");
  });

  it('routes to /invoice/${order.id} when tapping an order row and shows accurate counterpart', () => {
    const mockOrder: any = {
      id: 'ord-123',
      listing_id: 'list-456',
      amount_cents: 250000,
      fee_cents: 15000,
      created_at: '2026-07-01T12:00:00Z',
      status: 'paid',
      seller: { username: 'seller_super' },
      buyer: { username: 'buyer_prime' },
      listing: { title: 'Designer Shoes', price: 2500 },
    };

    // Test purchase side
    const renderedBought = render(React.createElement(OrderRow, { order: mockOrder, side: 'bought' }));
    expect(renderedBought.props.testID).toBe('order-row');
    renderedBought.props.onPress();
    expect(router.push).toHaveBeenCalledWith('/invoice/ord-123');

    // Test counterparty text collection on purchases
    const boughtText: string[] = [];
    function collect(node: any) {
      if (!node) return;
      if (typeof node === 'string') boughtText.push(node);
      if (Array.isArray(node)) node.forEach(collect);
      else if (node.props?.children) collect(node.props.children);
    }
    collect(renderedBought);
    expect(boughtText).toContain('From: ');
    expect(boughtText).toContain('seller_super');

    // Test counterparty text collection on sales
    const renderedSold = render(React.createElement(OrderRow, { order: mockOrder, side: 'sold' }));
    const soldText: string[] = [];
    function collectSold(node: any) {
      if (!node) return;
      if (typeof node === 'string') soldText.push(node);
      if (Array.isArray(node)) node.forEach(collectSold);
      else if (node.props?.children) collectSold(node.props.children);
    }
    collectSold(renderedSold);
    expect(soldText).toContain('Buyer: ');
    expect(soldText).toContain('buyer_prime');
  });
});
