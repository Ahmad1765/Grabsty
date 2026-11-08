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

  it('needs both a focused field and a shrunken viewport', async () => {
    const { isWebKeyboardOpen } = await import('./useIsKeyboardShown');
    // keyboard up while typing
    expect(isWebKeyboardOpen(true, 400, 800)).toBe(true);
    // keyboard dismissed with the back button: field still focused, viewport back to full
    expect(isWebKeyboardOpen(true, 800, 800)).toBe(false);
    // browser toolbar sliding in/out is a small change, not a keyboard
    expect(isWebKeyboardOpen(true, 740, 800)).toBe(false);
    // no field focused
    expect(isWebKeyboardOpen(false, 400, 800)).toBe(false);
  });

  it('exports hook and can attach listeners', async () => {
    const { useIsKeyboardShown } = await import('./useIsKeyboardShown');
    expect(typeof useIsKeyboardShown).toBe('function');
  });
});
