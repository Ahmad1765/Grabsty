/**
 * Web / Default Contact Sync Adapter
 *
 * Browsers do not permit automated address book reading due to sandbox security.
 * This adapter safely stubs the native sync functionality on Web and desktop,
 * preventing any native module crashes, and reports `isContactsSyncSupported = false`.
 */

export type MatchedFriend = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  followers_count: number;
  matched_hash?: string;
};

export type UnmatchedContact = {
  id: string;
  name: string;
  phoneNumber?: string;
  email?: string;
};

export type SyncProgress = {
  phase: 'idle' | 'reading' | 'hashing' | 'matching' | 'completed' | 'error';
  processedCount: number;
  totalCount: number;
  message: string;
};

export type ContactsPermissionStatus = {
  granted: boolean;
  canAskAgain: boolean;
  accessPrivileges?: 'all' | 'limited' | 'none';
  status: 'granted' | 'denied' | 'undetermined';
};

export type ContactSyncResult = {
  matchedFriends: MatchedFriend[];
  unmatchedContacts: UnmatchedContact[];
  accessPrivileges?: 'all' | 'limited' | 'none';
};

export const isContactsSyncSupported = false;

export async function presentAccessPicker(): Promise<string[] | null> {
  return null;
}

export async function syncContacts(
  _onProgress?: (progress: SyncProgress) => void,
): Promise<ContactSyncResult> {
  throw new Error('Contact sync is only supported in the mobile iOS & Android apps. Use the share options to invite friends.');
}

export async function registerMyHashes(
  _phone?: string | null,
  _email?: string | null,
): Promise<void> {
  // No-op on unsupported platforms
}
