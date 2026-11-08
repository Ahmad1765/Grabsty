// Pure welcome-email content. Free of Deno globals so vitest covers it, same
// arrangement as send-push/mapper.ts. Every promise here must stay true of the
// product: it currently describes Cash on Delivery, Buyer Protection and the 24h
// inspection window, so update it when those change.

const APP_URL = 'https://app.grabsty.com';
const PURPLE = '#6C47FF';
const INK = '#111111';
const MUTE = '#5C5C5C';

const PROMISES = [
  {
    problem: 'Nervous about paying a stranger?',
    answer: "You don't pay until your order reaches your door. Then you get 24 hours to check it, and Buyer Protection has your back if it isn't what was promised.",
  },
  {
    problem: 'A closet full of clothes you never wear?',
    answer: 'List them from your phone in a couple of minutes and turn them into cash.',
  },
  {
    problem: 'Tired of haggling in DMs that go nowhere?',
    answer: 'Make an offer right in the chat, with the item in view and a clear yes or no.',
  },
  {
    problem: 'Delivery always a headache?',
    answer: 'We arrange the courier and you can follow your order every step of the way.',
  },
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildWelcomeEmail(fullName?: string | null): { subject: string; html: string; text: string } {
  // First name only, and capped: this is a user-controlled profile field.
  const first = (fullName ?? '').trim().split(/\s+/)[0]?.slice(0, 40) ?? '';
  const greeting = first ? `Welcome aboard, ${first}.` : 'Welcome aboard.';
  const intro =
    "You just joined the place where great fashion gets a second life, and where buying and selling it finally feels good. Buckle up, it's going to be a joyful ride.";
  const outro = 'Questions? Just reply to this email. A real person reads it.';

  const rows = PROMISES.map(
    (p) => `<tr><td style="padding:0 0 20px">
      <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:${INK}">${escapeHtml(p.problem)}</p>
      <p style="margin:0;font-size:15px;line-height:22px;color:${MUTE}">${escapeHtml(p.answer)}</p>
    </td></tr>`,
  ).join('');

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#FFFFFF;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px">
  <tr><td style="padding:0 0 28px;font-size:20px;font-weight:800;color:${PURPLE}">Grabsty</td></tr>
  <tr><td style="padding:0 0 12px;font-size:26px;line-height:32px;font-weight:800;color:${INK}">${escapeHtml(greeting)}</td></tr>
  <tr><td style="padding:0 0 28px;font-size:15px;line-height:22px;color:${MUTE}">${escapeHtml(intro)}</td></tr>
  ${rows}
  <tr><td style="padding:8px 0 32px"><a href="${APP_URL}" style="display:inline-block;padding:14px 24px;border-radius:10px;background:${PURPLE};color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none">Start exploring</a></td></tr>
  <tr><td style="padding:20px 0 0;border-top:1px solid #E5E5E5;font-size:13px;line-height:20px;color:${MUTE}">${escapeHtml(outro)}<br>You're getting this because you just created a Grabsty account.</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    greeting,
    '',
    intro,
    '',
    ...PROMISES.flatMap((p) => [p.problem, p.answer, '']),
    `Start exploring: ${APP_URL}`,
    '',
    outro,
    "You're getting this because you just created a Grabsty account.",
  ].join('\n');

  return { subject: 'Welcome to Grabsty. Enjoy the ride.', html, text };
}
