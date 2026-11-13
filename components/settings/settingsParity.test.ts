import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// DEV-001: the phone layout of Settings must offer the same account controls as
// the desktop layout (store review requires in-app account deletion).
describe('Settings phone layout', () => {
  const src = readFileSync(join(__dirname, '../../app/settings.tsx'), 'utf8');
  const phone = src.slice(src.indexOf('<ChatGPTGroup title="Account">'));
  it.each(['Delete account', 'Blocked accounts', 'Share usage data', 'Public saved collection', 'Find & invite friends'])(
    'has %s',
    (label) => {
      expect(phone).toContain(label);
    },
  );
});
