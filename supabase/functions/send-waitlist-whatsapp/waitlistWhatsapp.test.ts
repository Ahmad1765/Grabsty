import { describe, it, expect } from 'vitest';
import { buildWhatsappMessage } from './waitlistWhatsapp';

const base = { to: '923001234567', template: 'waitlist_welcome', language: 'en', position: 12, code: 'GRB-ABC123' };
const params = (name: string) =>
  Object.fromEntries(
    buildWhatsappMessage({ ...base, name }).template.components[0].parameters.map((p) => [p.parameter_name, p.text]),
  );

describe('buildWhatsappMessage', () => {
  it('fills the template parameters', () => {
    expect(params('ayesha Khan')).toEqual({
      first_name: 'Ayesha',
      position: '12',
      invite_link: 'https://www.grabsty.com?ref=GRB-ABC123',
    });
    expect(buildWhatsappMessage({ ...base, name: 'A' }).to).toBe('+923001234567');
  });

  it('never lets a typed name carry a link into the message', () => {
    expect(params('visit.evil.com now').first_name).toBe('there');
  });
});
