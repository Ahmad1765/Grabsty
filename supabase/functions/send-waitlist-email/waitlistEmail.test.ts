import { describe, it, expect } from 'vitest';
import { buildWaitlistEmail, firstNameOf } from './waitlistEmail';

describe('firstNameOf', () => {
  it('keeps real names, including non-Latin and tidied casing', () => {
    expect(firstNameOf('Ayesha Khan')).toBe('Ayesha');
    expect(firstNameOf('ahmad')).toBe('Ahmad');
    expect(firstNameOf('SARA')).toBe('Sara');
    expect(firstNameOf('McKenzie')).toBe('McKenzie');
    expect(firstNameOf('عائشہ خان')).toBe('عائشہ');
  });

  it('drops anything a stranger could use to put a link or markup in the mail', () => {
    for (const bad of ['visit.evil.com', 'http://evil.com', '<img/src=x>', 'a@b.co', 'x'.repeat(41), '', null, undefined]) {
      expect(firstNameOf(bad)).toBe('');
    }
  });
});

describe('buildWaitlistEmail', () => {
  const base = { name: 'Ayesha Khan', role: 'buyer', code: 'GRB-ABC123', position: 12 };

  it('personalizes name, position and invite link', () => {
    const { subject, text, html } = buildWaitlistEmail(base);
    expect(subject).toContain('Ayesha');
    expect(text.startsWith('Hi Ayesha,')).toBe(true);
    expect(text).toContain("you're #12");
    expect(text).toContain('https://www.grabsty.com?ref=GRB-ABC123');
    expect(html).toContain('api.whatsapp.com');
  });

  it('speaks to each role, defaulting unknown roles to buyer', () => {
    expect(buildWaitlistEmail({ ...base, role: 'seller' }).text).toContain('list from your phone');
    expect(buildWaitlistEmail({ ...base, role: 'both' }).text).toContain('to buy and to sell');
    expect(buildWaitlistEmail({ ...base, role: 'admin' }).text).toContain("You're here for the finds");
  });

  it('mentions the friend only when referred', () => {
    expect(buildWaitlistEmail(base).text).not.toContain('A friend brought you');
    expect(buildWaitlistEmail({ ...base, referred: true }).text).toContain('A friend brought you');
  });

  it('still reads properly with no usable details', () => {
    const { subject, text, html } = buildWaitlistEmail({ name: 'visit.evil.com' });
    expect(subject).toBe('Thank you. Your spot on Grabsty is saved.');
    expect(text.startsWith('Hi there,')).toBe(true);
    expect(text).toContain('Your spot is saved.');
    expect(text).not.toContain('evil');
    expect(html).not.toContain('evil');
    expect(html).not.toContain('api.whatsapp.com');
    expect(text).not.toContain('moves you up');
  });
});
