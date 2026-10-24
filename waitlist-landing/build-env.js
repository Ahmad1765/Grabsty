// Writes env.js from Vercel env vars so the static page can read them.
// The PostHog project key is public by design (it ships to every browser).
const fs = require('fs');
const cfg = {
  key: (process.env.POSTHOG_KEY || '').trim(),
  host: (process.env.POSTHOG_HOST || 'https://eu.i.posthog.com').trim(),
};
fs.writeFileSync('env.js', `window.__POSTHOG__ = ${JSON.stringify(cfg)};\n`);
console.log(cfg.key ? 'env.js: PostHog enabled' : 'env.js: POSTHOG_KEY not set, analytics off');
