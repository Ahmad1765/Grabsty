import { useState, useEffect } from 'react';
import { Keyboard, Platform, type EmitterSubscription } from 'react-native';

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

export function useIsKeyboardShown(): boolean {
  const [isKeyboardShown, setIsKeyboardShown] = useState(() => {
    try {
      return typeof Keyboard.isVisible === 'function' ? Keyboard.isVisible() : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handleShow = () => setIsKeyboardShown(true);
    const handleHide = () => setIsKeyboardShown(false);

    // Web: react-native-web's Keyboard never emits, so the tab bar used to float
    // over the soft keyboard on phone browsers. A focused text field on a touch
    // screen means the keyboard is up; desktops keep the bar.
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined' || !window.matchMedia?.('(pointer: coarse)').matches) return;
      const sync = () => setIsKeyboardShown(isTypingTarget(document.activeElement));
      document.addEventListener('focusin', sync);
      document.addEventListener('focusout', sync);
      // focusout fires before focus lands on the next field; re-check after it settles.
      const settle = () => setTimeout(sync, 0);
      document.addEventListener('focusout', settle);
      return () => {
        document.removeEventListener('focusin', sync);
        document.removeEventListener('focusout', sync);
        document.removeEventListener('focusout', settle);
      };
    }

    const subscriptions: EmitterSubscription[] = [];

    try {
      if (Platform.OS === 'ios') {
        subscriptions.push(
          Keyboard.addListener('keyboardWillShow', handleShow),
          Keyboard.addListener('keyboardWillHide', handleHide),
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

    return () => {
      subscriptions.forEach((sub) => {
        try {
          sub.remove();
        } catch {}
      });
    };
  }, []);

  return isKeyboardShown;
}
