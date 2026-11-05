import { describe, it, expect } from 'vitest';
import { buildWelcomeEmail } from './welcomeEmail';

describe('buildWelcomeEmail', () => {
  it('greets by first name', () => {
    const { html, text } = buildWelcomeEmail('Ali Khan');
    expect(html).toContain('Welcome aboard, Ali.');
    expect(text).toContain('Welcome aboard, Ali.');
  });

  it('falls back when there is no usable name', () => {
    for (const name of [null, undefined, '', '   ']) {
      expect(buildWelcomeEmail(name).text.startsWith('Welcome aboard.')).toBe(true);
    }
  });

  it('never lets a profile name inject markup', () => {
    const { html } = buildWelcomeEmail('<img/src=x>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('caps a very long name', () => {
    expect(buildWelcomeEmail('x'.repeat(500)).text.split('\n')[0].length).toBeLessThan(60);
  });
});
