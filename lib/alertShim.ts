// react-native-web ships `Alert.alert` as a no-op (verified in
// node_modules/react-native-web/dist/.../Alert/index.js). Every existing call
// like `Alert.alert('Check your input', 'Enter a valid email')` is silently
// dropped, so users tap "Sign in" with a bad email and see nothing happen.
//
// Rather than rewriting every call site, we patch the shipped Alert object on
// web with an implementation that honours the standard RN API signature (title,
// message, buttons[]). Import this file once at the top of the root layout;
// installAlertShim() is idempotent.
//
// One or two buttons use the browser's own dialogs. Three or more can't (confirm
// only has OK/Cancel, which made every option but the first unreachable, so all
// web reports were filed under the first reason), so they get a small DOM dialog.
//
// Native (iOS / Android) is left untouched.

import { Alert, Platform, type AlertButton } from 'react-native';

let installed = false;

function showChoiceDialog(title: string, message: string | undefined, buttons: AlertButton[]): void {
  const backdrop = document.createElement('div');
  backdrop.style.cssText =
    'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(15,15,15,0.4);font-family:Inter,system-ui,sans-serif';

  const panel = document.createElement('div');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', title);
  panel.style.cssText =
    'width:100%;max-width:380px;max-height:80vh;overflow:auto;background:#FFFFFF;color:#111111;border-radius:16px;padding:20px';

  const heading = document.createElement('div');
  heading.textContent = title;
  heading.style.cssText = 'font-size:17px;font-weight:700;margin-bottom:4px';
  panel.appendChild(heading);
  if (message) {
    const body = document.createElement('div');
    body.textContent = message;
    body.style.cssText = 'font-size:14px;color:#5C5C5C;margin-bottom:8px';
    panel.appendChild(body);
  }

  const previousFocus = document.activeElement as HTMLElement | null;
  const close = (button?: AlertButton) => {
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    previousFocus?.focus?.();
    button?.onPress?.();
  };
  const cancel = buttons.find((b) => b.style === 'cancel');
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close(cancel);
  };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close(cancel);
  });

  // Cancel goes last, as it does in a native action sheet.
  const ordered = [...buttons.filter((b) => b.style !== 'cancel'), ...(cancel ? [cancel] : [])];
  for (const button of ordered) {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = button.text ?? 'OK';
    const color = button.style === 'destructive' ? '#EF4444' : '#111111';
    el.style.cssText = `display:block;width:100%;padding:12px 0;background:none;border:0;border-top:1px solid #E5E5E5;font:inherit;font-size:15px;cursor:pointer;text-align:left;color:${color};font-weight:${button.style === 'cancel' ? 400 : 600}`;
    el.addEventListener('click', () => close(button));
    panel.appendChild(el);
  }

  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);
  (panel.querySelector('button') as HTMLElement | null)?.focus();
}

export function installAlertShim(): void {
  if (installed) return;
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined') return;

  installed = true;

  Alert.alert = (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    _options?: unknown,
  ): void => {
    const body = message ? `${title}\n\n${message}` : title;

    if (!buttons || buttons.length === 0) {
      window.alert(body);
      return;
    }

    if (buttons.length === 1) {
      window.alert(body);
      buttons[0].onPress?.();
      return;
    }

    if (buttons.length > 2) {
      showChoiceDialog(title, message, buttons);
      return;
    }

    // Two buttons → confirm. OK runs the first non-cancel button's onPress
    // (typically the action); Cancel runs the cancel button's onPress.
    const confirmed = window.confirm(body);
    if (confirmed) {
      const action = buttons.find((b) => b.style !== 'cancel') ?? buttons[0];
      action.onPress?.();
    } else {
      const cancel = buttons.find((b) => b.style === 'cancel');
      cancel?.onPress?.();
    }
  };
}
