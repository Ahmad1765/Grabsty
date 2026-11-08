import type { Listing } from '@/types';
import { captureError } from '@/lib/sentry';

// Tiny module-level event bus for "a listing just appeared/disappeared".
// Used so the upload screen can tell the home feed about a freshly published
// listing without either screen importing the other's state. Avoids the
// refresh-to-see-my-listing bug where the feed's focus refetch can return
// stale data (replication lag) or get aborted (the web fetch wedge) and the
// user has to reload the browser to see what they just posted.

type Listener = (listing: Listing) => void;

const createdListeners = new Set<Listener>();
export function emitListingCreated(listing: Listing): void {
  const snapshot = Array.from(createdListeners);
  for (const fn of snapshot) {
    try {
      fn(listing);
    } catch (e) {
      captureError(e, { fn: 'listingEvents.listener' });
    }
  }
}
