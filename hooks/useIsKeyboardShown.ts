import { useState, useEffect } from 'react';
import { AppState, Keyboard, Platform, type EmitterSubscription, type KeyboardEvent } from 'react-native';

/**
 * Universal hook to track virtual software keyboard visibility across iOS, Android, and Web.
 *
 * - On iOS: Listens to 'keyboardWillShow' and 'keyboardWillHide' for frame-perfect early detection.
 * - On Android: Listens to 'keyboardDidShow' and 'keyboardDidHide', plus 'keyboardWillShow' and
 *   'keyboardWillHide' on supported Android 11+ window insets builds.
 * - Safely initializes from Keyboard.isVisible() where available.
 * - Leaves 0 stray listeners upon unmount.
 */
const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset', 'image', 'hidden']);

/** Does focusing this element bring up a soft keyboard? */
export function isTypingTarget(el: Element | null | undefined): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') return !NON_TEXT_INPUTS.has(((el as HTMLInputElement).type || 'text').toLowerCase());
  return (el as HTMLElement).isContentEditable === true;
}

// Soft keyboards take 250px+; browser toolbars sliding in/out move the viewport by less.
const KEYBOARD_MIN_PX = 150;
// Native: a hardware keyboard's shortcut bar is ~55-70px.
const NATIVE_KEYBOARD_MIN_PX = 100;

/**
 * Web keyboard state. Focus alone isn't enough: dismissing the keyboard with the
 * back button / hide key leaves the field focused, which used to keep the tab
 * bar hidden until the next tap. So also require the visible viewport to have
 * shrunk well below the full height.
 */
export function isWebKeyboardOpen(typing: boolean, viewportHeight: number, fullHeight: number): boolean {
  return typing && fullHeight - viewportHeight >= KEYBOARD_MIN_PX;
}

export function useIsKeyboardShown(): boolean {
  const [isKeyboardShown, setIsKeyboardShown] = useState(() => {
    try {
      return typeof Keyboard.isVisible === 'function' ? Keyboard.isVisible() : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    // A "show" with next to no height is a hardware keyboard's shortcut bar or
    // a floating iPad keyboard: nothing covers the tab bar, so it isn't "shown".
    const handleShow = (e?: KeyboardEvent) => {
      const h = e?.endCoordinates?.height;
      setIsKeyboardShown(typeof h === 'number' ? h >= NATIVE_KEYBOARD_MIN_PX : true);
    };
    const handleHide = () => setIsKeyboardShown(false);

    // Web: react-native-web's Keyboard never emits, so the tab bar used to float
    // over the soft keyboard on phone browsers. Touch screens only; desktops keep the bar.
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined' || !window.matchMedia?.('(pointer: coarse)').matches) return;
      const vv = window.visualViewport;
      const viewportHeight = () => vv?.height ?? window.innerHeight;
      // Tallest viewport seen at this width = height with no keyboard. Reset on rotation.
      let fullHeight = viewportHeight();
      let width = window.innerWidth;
      const sync = () => {
        if (window.innerWidth !== width) {
          width = window.innerWidth;
          fullHeight = viewportHeight();
        }
        fullHeight = Math.max(fullHeight, viewportHeight());
        const typing = isTypingTarget(document.activeElement);
        // No visualViewport (very old browsers): fall back to focus alone.
        setIsKeyboardShown(vv ? isWebKeyboardOpen(typing, viewportHeight(), fullHeight) : typing);
      };
      // focusout fires before focus lands on the next field; re-check after it settles.
      const settle = () => setTimeout(sync, 0);
      document.addEventListener('focusin', sync);
      document.addEventListener('focusout', settle);
      vv?.addEventListener('resize', sync);
      window.addEventListener('resize', sync);
      return () => {
        document.removeEventListener('focusin', sync);
        document.removeEventListener('focusout', settle);
        vv?.removeEventListener('resize', sync);
        window.removeEventListener('resize', sync);
      };
    }

    const subscriptions: EmitterSubscription[] = [];

    try {
      if (Platform.OS === 'ios') {
        subscriptions.push(
          Keyboard.addListener('keyboardWillShow', handleShow),
          Keyboard.addListener('keyboardWillHide', handleHide),
          // iOS can skip keyboardWillHide (a sheet or screen closing with a
          // field focused, the app going to the background). The state then
          // stayed "shown" and the tab bar stayed disabled until the next
          // keyboard cycle. The Did events and the checks below correct it.
          Keyboard.addListener('keyboardDidHide', handleHide),
          Keyboard.addListener('keyboardDidShow', handleShow),
        );
      } else {
        subscriptions.push(
          Keyboard.addListener('keyboardDidShow', handleShow),
          Keyboard.addListener('keyboardDidHide', handleHide),
        );
        // Also listen to willShow/willHide if available on newer Android builds
        try {
          subscriptions.push(
            Keyboard.addListener('keyboardWillShow', handleShow),
            Keyboard.addListener('keyboardWillHide', handleHide),
          );
        } catch {
          // not supported on this platform version, ignore
        }
      }
    } catch {
      // Safe fallback on platforms where Keyboard listener is unavailable
    }

    // Re-read the real state when the app comes back to the foreground.
    const resync = () => {
      try {
        if (typeof Keyboard.isVisible === 'function') setIsKeyboardShown(Keyboard.isVisible());
      } catch {}
    };
    let resyncTimer: ReturnType<typeof setTimeout> | undefined;
    const appState = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      clearTimeout(resyncTimer);
      resyncTimer = setTimeout(resync, 400);
    });

    return () => {
      clearTimeout(resyncTimer);
      appState.remove();
      subscriptions.forEach((sub) => {
        try {
          sub.remove();
        } catch {}
      });
    };
  }, []);

  return isKeyboardShown;
}
