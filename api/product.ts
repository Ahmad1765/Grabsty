// /product/<id> is rewritten here (vercel.json). The web app is a client-only
// SPA, so link crawlers (WhatsApp, Facebook, X, iMessage...) would only ever
// see "<title>Grabsty</title>". This serves the same index.html with the
// listing's Open Graph / Twitter tags injected; browsers boot the app as usual.

import { getListing, meta, price } from './_listing.js';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let shell: Promise<string> | null = null;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const origin = `https://${request.headers.get('x-forwarded-host') ?? url.host}`;

  // index.html is a static file, so this hits the CDN, not this function.
  shell ??= fetch(`${origin}/index.html`).then((r) => {
    if (!r.ok) throw new Error(`index.html ${r.status}`);
    return r.text();
  });
  let html: string;
  try {
    html = await shell;
  } catch {
    shell = null;
    return Response.redirect(`${origin}/`, 302);
  }

  const l = await getListing(id);
  if (l) {
    const pageUrl = `${origin}/product/${l.id}`;
    const title = `${l.title} · ${price(l.price)}${l.is_sold ? ' (Sold)' : ''}`;
    const details = meta(l);
    const desc = `${details ? `${details}. ` : ''}Thrifted on Grabsty, with Buyer Protection on every order.`;
    // wsrv turns the PNG into a small JPEG: WhatsApp drops previews over ~600 KB.
    const image = `https://wsrv.nl/?url=${encodeURIComponent(`${origin}/api/og?id=${l.id}`)}&output=jpg&q=88`;
    const tags = [
      ['og:type', 'product'],
      ['og:site_name', 'Grabsty'],
      ['og:title', title],
      ['og:description', desc],
      ['og:url', pageUrl],
      ['og:image', image],
      ['og:image:width', '1200'],
      ['og:image:height', '630'],
      ['og:image:alt', l.title],
      ['product:price:amount', String(l.price)],
      ['product:price:currency', 'PKR'],
    ]
      .map(([p, c]) => `<meta property="${p}" content="${esc(c)}" />`)
      .concat(
        [
          ['twitter:card', 'summary_large_image'],
          ['twitter:title', title],
          ['twitter:description', desc],
          ['twitter:image', image],
          ['description', desc],
        ].map(([n, c]) => `<meta name="${n}" content="${esc(c)}" />`),
        `<link rel="canonical" href="${esc(pageUrl)}" />`,
      )
      .join('');
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)} | Grabsty</title>${tags}`);
  }

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600',
    },
  });
}
