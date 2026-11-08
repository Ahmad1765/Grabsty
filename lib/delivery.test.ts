import { describe, expect, it } from 'vitest';
import { isDeliverableCountry } from './delivery';

describe('isDeliverableCountry', () => {
  it('accepts Pakistan in any spelling the server accepts, and blank', () => {
    for (const c of ['Pakistan', ' pakistan ', 'PK', 'pak', '', null, undefined]) {
      expect(isDeliverableCountry(c)).toBe(true);
    }
  });

  it('rejects every other country', () => {
    for (const c of ['United Arab Emirates', 'United States', 'India', 'UK', 'Pakistani Embassy, London']) {
      expect(isDeliverableCountry(c)).toBe(false);
    }
  });
});
