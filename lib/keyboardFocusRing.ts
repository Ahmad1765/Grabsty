// Web only: show focus rings to keyboard users, never to touch/mouse users.
//
// `:focus-visible` alone isn't enough. Browsers also match it on *programmatic*
// focus — RN-web's Modal focus trap focusing a sheet's first button, a
// `.focus()` call after a tap — so a purple ring would flash on whatever got
// focused (e.g. a line across the top of the Discover sheet). Instead,
// global.css only draws the ring while <html data-keyboard-nav> is set: Tab
// turns it on, the next pointer press turns it off.

const ATTR = 'data-keyboard-nav';

export function installKeyboardFocusRing(): () => void {
  if (typeof document === 'undefined') return () => {};
  const root = document.documentElement;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Tab') root.setAttribute(ATTR, '');
  };
  const onPointer = () => root.removeAttribute(ATTR);
  // Capture phase so nothing that stops propagation can hide the event.
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', onPointer, true);
  return () => {
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onPointer, true);
    root.removeAttribute(ATTR);
  };
}
