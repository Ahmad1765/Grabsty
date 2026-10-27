import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { ProductActionBar } from './ProductActionBar';
import { lightTheme } from '@/lib/theme';

vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web || obj.default },
  View: (props: any) => React.createElement('div', props, props.children),
  Text: (props: any) => React.createElement('span', props, props.children),
  Pressable: (props: any) => {
    const style = typeof props.style === 'function' ? props.style({ pressed: false }) : props.style;
    return React.createElement('button', { ...props, style }, props.children);
  },
  StyleSheet: { create: (s: any) => s, hairlineWidth: 1 },
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('expo-haptics', () => ({
  impactAsync: vi.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

vi.mock('@/lib/rnText', () => ({
  Text: (props: any) => React.createElement('span', props, props.children),
}));

vi.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({ theme: lightTheme, isDark: false }),
}));

describe('ProductActionBar Invariant & Styling Protection', () => {
  beforeEach(() => {
    vi.spyOn(React, 'useState').mockImplementation(((initial: any) => [initial, vi.fn()]) as any);
    vi.spyOn(React, 'useEffect').mockImplementation(() => {});
  });

  it('strictly enforces 10px corner radius and monochrome colors for Offer and Buy buttons', () => {
    const element = React.createElement(ProductActionBar, {
      price: 3180,
      buyTotal: 3180,
    });
    const rendered = (element.type as any)(element.props);

    // Root container children: [actionRow]
    const actionRow = rendered.props.children;
    expect(actionRow.props.children).toHaveLength(2);

    const [offerButton, buyButton] = actionRow.props.children;

    const getResolvedStyle = (element: any) => {
      const raw = typeof element.props.style === 'function'
        ? element.props.style({ pressed: false })
        : element.props.style;
      return Array.isArray(raw) ? Object.assign({}, ...raw.flat(Infinity)) : raw;
    };

    // 1. Offer button invariant: 10px radius, white panel background, hairline border, ink text
    const offerStyle = getResolvedStyle(offerButton);

    expect(offerStyle.borderRadius).toBe(10);
    expect(offerStyle.height).toBe(48);
    expect(offerStyle.borderWidth).toBe(1);
    expect(offerStyle.backgroundColor).toBe(lightTheme.panel); // #FFFFFF
    expect(offerStyle.borderColor).toBe(lightTheme.border);

    const offerText = offerButton.props.children;
    const offerTextStyle = getResolvedStyle(offerText);
    expect(offerTextStyle.color).toBe(lightTheme.ink); // #111111
    expect(offerText.props.children).toBe('Make an offer');

    // 2. Buy button invariant: 10px radius, solid ink background, solid ink border, white text
    const buyStyle = getResolvedStyle(buyButton);

    expect(buyStyle.borderRadius).toBe(10);
    expect(buyStyle.height).toBe(48);
    expect(buyStyle.borderWidth).toBe(1);
    expect(buyStyle.backgroundColor).toBe(lightTheme.ink); // #111111
    expect(buyStyle.borderColor).toBe(lightTheme.ink); // #111111
    expect(buyStyle.backgroundColor).not.toBe(lightTheme.purple); // Never purple

    const buyText = buyButton.props.children;
    const buyTextStyle = Array.isArray(buyText.props.style)
      ? Object.assign({}, ...buyText.props.style)
      : buyText.props.style;
    expect(buyTextStyle.color).toBe(lightTheme.background); // #FFFFFF
    expect(buyText.props.children).toBe('Buy now');
  });

  it('renders View Order button for sellers viewing their own sold item', () => {
    const onViewOrderMock = vi.fn();
    const element = React.createElement(ProductActionBar, {
      price: 2500,
      isOwner: true,
      isSold: true,
      onViewOrderPress: onViewOrderMock,
    });
    const rendered = (element.type as any)(element.props);
    const actionRow = rendered.props.children;
    const [infoView, viewOrderBtn] = actionRow.props.children;

    expect(infoView.props.children[0].props.children).toBe('Item Sold!');
    const buttonText = viewOrderBtn.props.children.props.children;
    expect(buttonText).toBe('View Order');

    viewOrderBtn.props.onPress();
    expect(onViewOrderMock).toHaveBeenCalled();
  });

  it('renders passive sold banner for non-owners viewing a sold item', () => {
    const element = React.createElement(ProductActionBar, {
      price: 2500,
      isOwner: false,
      isSold: true,
    });
    const rendered = (element.type as any)(element.props);
    const soldContainer = rendered.props.children;
    const soldText = soldContainer.props.children.props.children;
    expect(soldText).toBe('This item has been sold');
  });

  it('renders "Buy bundle" text when multiple items in bundle are selected', () => {
    const element = React.createElement(ProductActionBar, {
      price: 3180,
      buyTotal: 6800,
      isBundle: true,
      bundleCount: 2,
    });
    const rendered = (element.type as any)(element.props);
    const actionRow = rendered.props.children;
    const [, buyButton] = actionRow.props.children;
    const buyText = buyButton.props.children;
    expect(buyText.props.children).toBe('Buy bundle');
  });
});
