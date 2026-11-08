// Time formatting and message-grouping rules for the chat surfaces.
//
// The inbox and the conversation thread both read from here so a timestamp
// never means two different things in two places, and so the "when does a run
// of messages collapse into one group" rule lives in exactly one spot.

import type { ChatMessage } from '@/lib/chat';

/** Consecutive messages from the same sender inside this window collapse into
 *  one group: one tail, one meta line, tight spacing between the bubbles. */
export const GROUP_WINDOW_MS = 5 * 60_000;


function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function isSameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

/** "21:03" — the stamp for something sent today. */
export function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
/** The stamp printed under a bubble group: e.g. "20:55" or "16:14" */
export function bubbleStamp(iso: string): string {
  return timeOfDay(iso);
}

/** "Feb 23 2025" / "Dec 10 2025" / "May 27 2026" — the in-thread divider. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()] || 'Jan';
  const day = d.getDate();
  const year = d.getFullYear();
  return `${month} ${day} ${year}`;
}

/** "19 days ago" — the inbox stamp. Coarse on purpose: an inbox row answers
 *  "how stale is this thread", not "exactly when". */
export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  return `${Math.floor(months / 12)} year${Math.floor(months / 12) === 1 ? '' : 's'} ago`;
}

/** Does `msg` continue the run started by `prev`? Offers and system notices are
 *  events rather than chatter, so they never group — each one stands alone. */
export function shouldGroup(prev: ChatMessage | undefined, msg: ChatMessage): boolean {
  if (!prev) return false;
  if (prev.sender_id !== msg.sender_id) return false;
  if (prev.kind !== 'text' || msg.kind !== 'text') return false;
  // An in-flight or failed message owns its own meta line — grouping it would
  // hide "Sending…" / "Tap to retry" behind the next message's stamp.
  if (prev.pending || prev.failed || msg.pending || msg.failed) return false;
  if (!isSameDay(prev.created_at, msg.created_at)) return false;
  return new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_WINDOW_MS;
}

// ── Thread rows ───────────────────────────────────────────────────────────
// The thread renders a flat list of rows, not of messages: date dividers are
// real rows so they virtualize with everything else, and each message row
// carries the grouping flags its bubble needs.

export type ThreadRow =
  | { type: 'date'; key: string; iso: string }
  | { type: 'message'; key: string; msg: ChatMessage; grouped: boolean; lastOfGroup: boolean };

export function buildThreadRows(messages: ChatMessage[]): ThreadRow[] {
  const rows: ThreadRow[] = [];
  messages.forEach((msg, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    if (!prev || !isSameDay(prev.created_at, msg.created_at)) {
      rows.push({ type: 'date', key: `date-${msg.id}`, iso: msg.created_at });
    }
    rows.push({
      type: 'message',
      key: msg.id,
      msg,
      grouped: shouldGroup(prev, msg),
      lastOfGroup: !next || !shouldGroup(msg, next),
    });
  });
  return rows;
}
