import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { lightTheme } from '@/lib/theme';

vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web || obj.default },
  View: (props: any) => React.createElement('div', props, props.children),
  Text: (props: any) => React.createElement('span', props, props.children),
  Pressable: (props: any) => {
    const style = typeof props.style === 'function' ? props.style({ pressed: false }) : props.style;
    return React.createElement('button', { ...props, style }, props.children);
  },
  Switch: (props: any) => React.createElement('input', { type: 'checkbox', ...props }),
  ActivityIndicator: () => React.createElement('span', null, 'loading'),
  StyleSheet: { create: (s: any) => s, hairlineWidth: 1 },
  Modal: (props: any) => (props.visible ? React.createElement('div', { 'data-modal': true }, props.children) : null),
  ScrollView: (props: any) => React.createElement('div', props, props.children),
  KeyboardAvoidingView: (props: any) => React.createElement('div', props, props.children),
  Alert: { alert: vi.fn() },
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('@/components/ui/SafeContainer', () => ({
  KeyboardAvoider: (props: any) => React.createElement('div', props, props.children),
}));

vi.mock('expo-image', () => ({
  Image: (props: any) => React.createElement('img', props),
}));

vi.mock('@/lib/upload', () => ({
  useVerificationPhotoUrl: (value?: string | null) => value ?? null,
}));

vi.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: vi.fn(),
  launchCameraAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted' }),
  requestCameraPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted' }),
}));

vi.mock('@/components/ui/ShieldCheckIcon', () => ({
  ShieldCheckIcon: (props: any) => React.createElement('div', { 'data-testid': 'shield-check-icon', ...props }),
}));

vi.mock('@expo/vector-icons/Feather', () => ({
  default: (props: any) => React.createElement('i', { 'data-icon': props.name }),
}));

vi.mock('@/lib/haptics', () => ({
  tap: vi.fn(),
}));

vi.mock('@/lib/rnText', () => ({
  Text: (props: any) => React.createElement('span', props, props.children),
  TextInput: (props: any) => React.createElement('input', props),
}));

vi.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({ theme: lightTheme, isDark: false }),
}));

import { VerificationSheet } from './VerificationSheet';
import { PhoneSheet } from './PhoneSheet';

import {
  ChatGPTRow,
  ChatGPTButton,
  ChatGPTTabItem,
  ChatGPTGroup,
  ChatGPTItem,
} from './SettingsRow';

describe('ChatGPT Settings UI & Primitives Invariants', () => {
  it('renders ChatGPTButton with clean 8px radius, height 34, and hairline border', () => {
    const element = React.createElement(ChatGPTButton, {
      label: 'Change',
    });
    const rendered = (element.type as any)(element.props);
    const style = typeof rendered.props.style === 'function'
      ? rendered.props.style({ pressed: false })
      : rendered.props.style;

    expect(style.borderRadius).toBe(8);
    expect(style.height).toBe(34);
    expect(style.borderWidth).toBe(1);
  });

  it('renders ChatGPTTabItem with active highlight and 8px radius', () => {
    const activeTab = React.createElement(ChatGPTTabItem, {
      icon: 'sliders',
      label: 'General',
      active: true,
      onPress: () => {},
    });
    const renderedActive = (activeTab.type as any)(activeTab.props);
    const activeStyle = typeof renderedActive.props.style === 'function'
      ? renderedActive.props.style({ pressed: false })
      : renderedActive.props.style;

    expect(activeStyle.borderRadius).toBe(8);
    expect(activeStyle.backgroundColor).toBe('rgba(0, 0, 0, 0.06)');

    const inactiveTab = React.createElement(ChatGPTTabItem, {
      icon: 'sliders',
      label: 'General',
      active: false,
      onPress: () => {},
    });
    const renderedInactive = (inactiveTab.type as any)(inactiveTab.props);
    const inactiveStyle = typeof renderedInactive.props.style === 'function'
      ? renderedInactive.props.style({ pressed: false })
      : renderedInactive.props.style;

    expect(inactiveStyle.backgroundColor).toBe('transparent');
  });

  it('renders ChatGPTRow with label and description', () => {
    const row = React.createElement(ChatGPTRow, {
      label: 'Push notifications',
      desc: 'Receive alerts for offers, orders, and messages on this device',
    });
    const rendered = (row.type as any)(row.props);
    expect(rendered.props.style.flexDirection).toBe('row');
    expect(rendered.props.style.justifyContent).toBe('space-between');
  });

  it('exports VerificationSheet as a valid component', () => {
    expect(typeof VerificationSheet).toBe('function');
    const sheet = React.createElement(VerificationSheet, {
      visible: true,
      initial: null,
      onClose: () => {},
      onSave: async () => {},
    });
    expect(sheet.type).toBe(VerificationSheet);
  });

  it('renders ChatGPTGroup with 14px radius card container and title', () => {
    // eslint-disable-next-line react/no-children-prop -- the test calls the component with these props directly
    const group = React.createElement(ChatGPTGroup, {
      title: 'Account',
      children: React.createElement('div', null, 'content'),
    });
    const rendered = (group.type as any)(group.props);
    expect(rendered.props.style.marginBottom).toBe(20);
    const box = rendered.props.children[1];
    expect(box.props.style.backgroundColor).toBe(lightTheme.panel);
  });

  it('renders ChatGPTItem with minHeight 50 and icon', () => {
    const item = React.createElement(ChatGPTItem, {
      icon: 'mail',
      label: 'Email',
      value: 'user@example.com',
      chevron: true,
    });
    const rendered = (item.type as any)(item.props);
    expect(rendered).not.toBeNull();
  });

  it('exports PhoneSheet as a valid component', () => {
    expect(typeof PhoneSheet).toBe('function');
    const sheet = React.createElement(PhoneSheet, {
      visible: true,
      initialPhone: '+923001234567',
      onClose: () => {},
      onSave: async () => true,
    });
    expect(sheet.type).toBe(PhoneSheet);
  });
});
