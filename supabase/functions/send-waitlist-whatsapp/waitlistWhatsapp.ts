// Pure WhatsApp request builder, free of Deno globals so vitest covers it.
// Outside a customer service window Meta only delivers approved templates, so the
// wording lives in WhatsApp Manager and only these three values are sent. The template
// must be created with "parameter_format": "named" and exactly these parameter names.

import { firstNameOf } from '../send-waitlist-email/waitlistEmail.ts';

export const GRAPH_URL = 'https://graph.facebook.com/v27.0';
const SITE_URL = 'https://www.grabsty.com';

export function buildWhatsappMessage(input: {
  to: string;
  template: string;
  language: string;
  name?: string | null;
  position: number;
  code: string;
}) {
  const param = (parameter_name: string, text: string) => ({ type: 'text', parameter_name, text });
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: `+${input.to}`,
    type: 'template',
    template: {
      name: input.template,
      language: { code: input.language },
      components: [
        {
          type: 'body',
          parameters: [
            param('first_name', firstNameOf(input.name) || 'there'),
            param('position', String(input.position)),
            param('invite_link', `${SITE_URL}?ref=${encodeURIComponent(input.code)}`),
          ],
        },
      ],
    },
  };
}
