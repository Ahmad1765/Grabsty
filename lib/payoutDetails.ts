// Payout + CNIC input rules. Mirrors the server checks in
// supabase/migrations/20261110000000_payout_details_and_cnic_kyc.sql —
// change both together.

import type { PayoutKind } from '@/types';

export const WALLET_PROVIDERS = ['JazzCash', 'Easypaisa', 'SadaPay', 'NayaPay'] as const;

/**
 * Strip spaces/dashes and uppercase, the way the server stores it. Wallet
 * numbers written internationally (+92 300…, 92300…) become 0300….
 */
export const normalizeAccountNumber = (s: string) =>
  s.replace(/[\s-]/g, '').toUpperCase().replace(/^\+?92(3[0-9]{9})$/, '0$1');

/** null when valid, else the message to show under the field. */
export function accountNumberError(kind: PayoutKind, raw: string): string | null {
  const n = normalizeAccountNumber(raw);
  if (kind === 'wallet') return /^03[0-9]{9}$/.test(n) ? null : 'Use the wallet number as 03XXXXXXXXX';
  return /^(PK[0-9]{2}[A-Z]{4}[0-9]{16}|[0-9]{8,20})$/.test(n)
    ? null
    : 'Enter a 24-character IBAN (PK…) or your account number';
}

export const accountTitleError = (s: string) =>
  s.trim().length >= 3 && s.trim().length <= 80 ? null : 'Full name as it appears on the account';

export const cnicDigits = (s: string) => s.replace(/[^0-9]/g, '').slice(0, 13);

/** 3520112345671 -> 35201-1234567-1 (formats partial input as you type). */
export function formatCnic(s: string): string {
  const d = cnicDigits(s);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

export const isValidCnic = (s: string) => cnicDigits(s).length === 13;

/**
 * The CNIC front photo lives in `verifications.notes`, but admin_review_kyc
 * overwrites `notes` with the rejection reason. Only an upload path in the
 * user's own folder ("<user_id>/<file>") is a photo; anything else is a reason.
 */
export function cnicFrontPath(v: { user_id: string; notes: string | null } | null | undefined): string | null {
  return v?.notes?.startsWith(`${v.user_id}/`) ? v.notes : null;
}

/**
 * Why a verification wasn't approved: review_notes (since ADM-005), else the
 * older rows that kept the reason in notes.
 */
export function rejectionReason(
  v: { user_id: string; notes: string | null; review_notes?: string | null } | null | undefined,
): string | null {
  if (!v) return null;
  if (v.review_notes?.trim()) return v.review_notes.trim();
  return v.notes && !cnicFrontPath(v) ? v.notes : null;
}
