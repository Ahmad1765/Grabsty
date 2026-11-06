// Pure waitlist thank-you content, free of Deno globals so vitest covers it (same
// arrangement as send-welcome-email/welcomeEmail.ts). Every promise here must stay
// true of the product: it describes Cash on Delivery, the 24h check and WhatsApp invites.

const SITE_URL = 'https://www.grabsty.com';
const PURPLE = '#5A59EE';
const INK = '#111111';
const MUTE = '#5C5C5C';

const ROLE_LINES: Record<string, string> = {
  buyer:
    "You're here for the finds, and we want buying from a stranger to feel safe. You won't pay until your order reaches your door, and then you'll have 24 hours to check it.",
  seller:
    "You've got pieces that deserve a second life, and we want selling them to feel easy. You'll list from your phone in a couple of minutes, and we'll arrange the courier.",
  both:
    "You're here to buy and to sell, which is exactly who we're building this for. You'll be able to clear out your closet in a couple of minutes, and you won't pay for your finds until they reach your door and you've had 24 hours to check them.",
};

export type WaitlistEmailInput = {
  name?: string | null;
  role?: string | null;
  code?: string | null;
  position?: number | null;
  referred?: boolean;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// The public form lets anyone type any name next to any address, so this mail could
// be aimed at a stranger. Only something shaped like a name gets through; "visit.evil.com"
// or a phrase never reaches the inbox. Urdu names pass.
export function firstNameOf(name?: string | null): string {
  const token = (name ?? '').trim().split(/\s+/)[0] ?? '';
  if (!/^[\p{L}\p{M}][\p{L}\p{M}'’-]{0,39}$/u.test(token)) return '';
  const uniform = token === token.toLowerCase() || token === token.toUpperCase();
  return uniform ? token[0].toUpperCase() + token.slice(1).toLowerCase() : token;
}

export function buildWaitlistEmail(input: WaitlistEmailInput): { subject: string; html: string; text: string } {
  const first = firstNameOf(input.name);
  const inviteUrl = input.code ? `${SITE_URL}?ref=${encodeURIComponent(input.code)}` : null;
  const shareUrl = inviteUrl
    ? `https://api.whatsapp.com/send?text=${encodeURIComponent(`Join me on the Grabsty waitlist: buy and sell pre-loved clothes, sneakers and bags. ${inviteUrl}`)}`
    : null;

  const greeting = first ? `Hi ${first},` : 'Hi there,';
  const paragraphs = [
    "Thank you for joining the Grabsty waitlist. We haven't opened our doors yet, and you put your name down anyway. That's a small act of trust, and it means a great deal to us.",
    ...(input.referred ? ['A friend brought you here, which is the nicest way anyone could find us.'] : []),
    ROLE_LINES[input.role ?? ''] ?? ROLE_LINES.buyer,
    [
      input.position ? `Right now you're #${input.position} on the list.` : "Your spot is saved.",
      "When Grabsty opens in Lahore, we'll send your invite on WhatsApp.",
      ...(inviteUrl ? ['Every friend who joins with your link moves you up.'] : []),
    ].join(' '),
  ];
  const closing = "And if you've got a question, or just want to tell us what you're hoping to find here, reply to this email. A real person reads it.";
  const footer = "You're getting this because this address was used to join the waitlist at grabsty.com. If that wasn't you, reply and we'll remove it.";

  const p = (t: string) => `<tr><td style="padding:0 0 16px;font-size:16px;line-height:25px;color:${INK}">${escapeHtml(t)}</td></tr>`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#FFFFFF;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px">
  <tr><td style="padding:0 0 28px;font-size:20px;font-weight:800;color:${PURPLE}">Grabsty</td></tr>
  ${p(greeting)}
  ${paragraphs.map(p).join('\n  ')}
  ${shareUrl && inviteUrl ? `<tr><td style="padding:8px 0 24px"><a href="${escapeHtml(shareUrl)}" style="display:inline-block;padding:14px 24px;border-radius:10px;background:${PURPLE};color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none">Share your invite on WhatsApp</a><br><span style="display:inline-block;padding-top:12px;font-size:13px;color:${MUTE}">Your link: <a href="${escapeHtml(inviteUrl)}" style="color:${PURPLE}">${escapeHtml(inviteUrl)}</a></span></td></tr>` : ''}
  ${p(closing)}
  <tr><td style="padding:0 0 32px;font-size:16px;line-height:25px;color:${INK}">With gratitude,<br>The Grabsty team</td></tr>
  <tr><td style="padding:20px 0 0;border-top:1px solid #E5E5E5;font-size:13px;line-height:20px;color:${MUTE}">${escapeHtml(footer)}</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    greeting,
    '',
    ...paragraphs.flatMap((t) => [t, '']),
    ...(inviteUrl ? [`Your invite link: ${inviteUrl}`, ''] : []),
    closing,
    '',
    'With gratitude,',
    'The Grabsty team',
    '',
    footer,
  ].join('\n');

  return {
    subject: first ? `Thank you, ${first}. Your spot on Grabsty is saved.` : 'Thank you. Your spot on Grabsty is saved.',
    html,
    text,
  };
}
