import { describe, expect, it } from 'vitest';
import { listingMeta } from './listingMeta';

describe('listingMeta', () => {
  it('joins brand, size and condition label', () => {
    expect(listingMeta({ brand: ' Adidas ', size: 'US 10', condition: 'like_new' })).toBe('Adidas · Size US 10 · Like new');
  });
  it('skips missing parts and passes unknown conditions through', () => {
    expect(listingMeta({ brand: null, size: '  ', condition: 'mint' })).toBe('mint');
    expect(listingMeta({})).toBe('');
  });
});
