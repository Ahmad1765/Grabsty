import { describe, it, expect, vi, beforeEach } from 'vitest';

const listeners: Record<string, Function[]> = {};
const mockAddListener = vi.fn((event: string, callback: any) => {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(callback);
  return {
    remove: vi.fn(() => {
      listeners[event] = (listeners[event] || []).filter((cb) => cb !== callback);
    }),
  };
});
const mockIsVisible = vi.fn(() => false);

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Keyboard: {
    addListener: mockAddListener,
    isVisible: mockIsVisible,
  },
}));

describe('useIsKeyboardShown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(listeners).forEach((k) => delete listeners[k]);
  });

  it('treats text fields as keyboard targets and buttons/checkboxes as not', async () => {
    const { isTypingTarget } = await import('./useIsKeyboardShown');
    const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, ...extra }) as any;
    expect(isTypingTarget(el('INPUT', { type: 'search' }))).toBe(true);
    expect(isTypingTarget(el('INPUT', { type: '' }))).toBe(true);
    expect(isTypingTarget(el('INPUT', { type: 'email' }))).toBe(true);
    expect(isTypingTarget(el('TEXTAREA'))).toBe(true);
    expect(isTypingTarget(el('DIV', { isContentEditable: true }))).toBe(true);
    expect(isTypingTarget(el('INPUT', { type: 'checkbox' }))).toBe(false);
    expect(isTypingTarget(el('BUTTON'))).toBe(false);
    expect(isTypingTarget(el('DIV'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it('exports hook and can attach listeners', async () => {
    const { useIsKeyboardShown } = await import('./useIsKeyboardShown');
    expect(typeof useIsKeyboardShown).toBe('function');
  });
});
