import { describe, expect, it } from 'vitest';
import { redactData, redactUrl } from './sentryScrub';

describe('redactUrl', () => {
  it('redacts tokens in a reset-link fragment', () => {
    expect(redactUrl('https://app.grabsty.com/auth/reset#access_token=eyJhb.x&refresh_token=abc&type=recovery'))
      .toBe('https://app.grabsty.com/auth/reset#access_token=[redacted]&refresh_token=[redacted]&type=recovery');
  });

  it('redacts a PKCE code and deep-link tokens', () => {
    expect(redactUrl('grabsty://auth-callback?code=123-abc')).toBe('grabsty://auth-callback?code=[redacted]');
  });

  it('drops the whole query of Supabase REST calls (search terms)', () => {
    expect(redactUrl('https://x.supabase.co/rest/v1/listings?or=(title.ilike.*my%20secret*)&limit=20'))
      .toBe('https://x.supabase.co/rest/v1/listings');
  });

  it('leaves ordinary URLs alone', () => {
    expect(redactUrl('/product/123?from=feed')).toBe('/product/123?from=feed');
  });

  it('scrubs string values in breadcrumb data only', () => {
    expect(redactData({ url: 'grabsty://x?token=s3cret', status_code: 200 }))
      .toEqual({ url: 'grabsty://x?token=[redacted]', status_code: 200 });
  });
});
