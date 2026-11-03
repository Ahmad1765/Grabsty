// Contact hashing shared by every platform. Native contact sync hashes the
// address book with these, and every signed-in user (web included) registers
// their own phone/email hashes so other people's syncs can find them. Both
// sides must hash identically, so this is the only implementation.
import * as Crypto from 'expo-crypto';
import * as Localization from 'expo-localization';
import { supabase } from '@/lib/supabase';
import { getContactPepper } from '@/lib/cryptoPepper';
import { normalizePhoneNumber, normalizeEmail, type CountryCode } from '@/lib/contactNormalization';

export function getDeviceCountry(): CountryCode {
  try {
    const region = Localization.getLocales()[0]?.regionCode;
    if (region && region.length === 2) return region.toUpperCase() as CountryCode;
  } catch {
    // fall through
  }
  return 'US';
}

export async function hashContactValue(value: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${value.trim()}:${getContactPepper()}`,
  );
}

/** Registers the signed-in user's own phone/email hashes for reciprocal matching. */
export async function registerMyHashes(rawPhone?: string | null, rawEmail?: string | null): Promise<void> {
  const e164 = rawPhone ? normalizePhoneNumber(rawPhone, getDeviceCountry()) : null;
  const email = rawEmail ? normalizeEmail(rawEmail) : null;
  if (!e164 && !email) return;

  const { error } = await supabase.rpc('register_my_contact_hashes', {
    p_phone_hashes: e164 ? [await hashContactValue(e164)] : null,
    p_email_hashes: email ? [await hashContactValue(email)] : null,
  });
  if (error) console.warn('[contactHashes] register failed:', error.message);
}
