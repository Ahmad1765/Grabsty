import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { GrabstyLogo } from './GrabstyLogo';

vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web || obj.default },
  View: (props: any) => React.createElement('div', props, props.children),
  StyleSheet: { create: (s: any) => s },
}));

vi.mock('@/lib/rnText', () => ({
  Text: (props: any) => React.createElement('span', props, props.children),
}));

vi.mock('react-native-svg', () => ({
  default: (props: any) => React.createElement('svg', props, props.children),
  Path: (props: any) => React.createElement('path', props),
  Rect: (props: any) => React.createElement('rect', props),
}));

vi.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      ink: '#0F0F0F',
      panel: '#FFFFFF',
      surface: '#F6F6F6',
      purple: '#6C47FF',
    },
    isDark: false,
  }),
}));

function render(element: React.ReactElement<any>) {
  const Component = element.type as any;
  const renderFn = Component.type || Component;
  return renderFn(element.props);
}

describe('GrabstyLogo Component', () => {
  it('renders the favicon tile: brand purple, ink outline layers, white face', () => {
    const rendered = render(React.createElement(GrabstyLogo));
    const svg = rendered.props.children;
    expect(svg.props.width).toBe(28);
    expect(svg.props.height).toBe(28);
    expect(svg.props.accessibilityLabel).toBe('Grabsty');

    const [rect, inkLayers, face] = svg.props.children;
    expect(rect.props.fill).toBe('#5A59EE');
    expect(inkLayers).toHaveLength(2);
    inkLayers.forEach((p: any) => expect(p.props.fill).toBe('#231F20'));
    expect(face.props.fill).toBe('#FFFFFF');
  });

  it('renders full variant as the mark plus the official logotype in ink', () => {
    const rendered = render(React.createElement(GrabstyLogo, { variant: 'full', size: 32 }));
    const [mark, logotype] = rendered.props.children;
    expect(mark.props.width).toBe(32);
    expect(logotype.props.height).toBe(32);
    const glyphs = logotype.props.children;
    expect(glyphs).toHaveLength(7); // G r a b s t y
    glyphs.forEach((p: any) => expect(p.props.fill).toBe('#0F0F0F'));
  });
});
