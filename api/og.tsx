/** @jsxRuntime automatic */
/** @jsxImportSource react */
// GET /api/og?id=<listing uuid> -> 1200x630 PNG preview card for link unfurls
// (WhatsApp, Facebook, X, iMessage, Discord...). Referenced from the og:image
// tag that api/product.ts injects. Photo left, details right, three-hue palette.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from '@vercel/og';
import { getListing, meta, price } from './_listing.js';

const INK = '#111111';
const MUTE = '#6B6B6B';
const PURPLE = '#6C47FF';

let fonts: Promise<{ name: string; data: Buffer; weight: 500 | 700; style: 'normal' }[]> | null = null;
function loadFonts() {
  const dir = join(process.cwd(), 'node_modules/@expo-google-fonts/inter');
  fonts ??= Promise.all([
    readFile(join(dir, '500Medium/Inter_500Medium.ttf')),
    readFile(join(dir, '700Bold/Inter_700Bold.ttf')),
  ]).then(([m, b]) => [
    { name: 'Inter', data: m, weight: 500, style: 'normal' },
    { name: 'Inter', data: b, weight: 700, style: 'normal' },
  ]);
  return fonts;
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  const [l, f] = await Promise.all([getListing(id), loadFonts()]);

  const photo = l?.images?.[0]
    ? `https://wsrv.nl/?url=${encodeURIComponent(l.images[0])}&w=600&h=630&fit=cover&output=jpg&q=85`
    : null;
  const details = l ? meta(l) : '';

  const card = (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: '#FFFFFF', fontFamily: 'Inter' }}>
      <div style={{ width: 600, height: 630, display: 'flex', position: 'relative', background: '#F6F6F6' }}>
        {photo ? <img src={photo} width={600} height={630} style={{ objectFit: 'cover' }} /> : null}
        {l?.is_sold ? (
          <div
            style={{
              position: 'absolute',
              top: 32,
              left: 32,
              display: 'flex',
              padding: '10px 22px',
              background: PURPLE,
              color: '#FFFFFF',
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            Sold
          </div>
        ) : null}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '56px 56px 52px' }}>
        <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, color: PURPLE, letterSpacing: -1 }}>Grabsty</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'block',
              fontSize: 50,
              fontWeight: 700,
              color: INK,
              lineHeight: 1.15,
              letterSpacing: -1.5,
              lineClamp: 3,
            }}
          >
            {l?.title ?? 'Thrift it on Grabsty'}
          </div>
          {details ? (
            <div style={{ display: 'flex', fontSize: 28, fontWeight: 500, color: MUTE, marginTop: 18 }}>{details}</div>
          ) : null}
          {l ? (
            <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, color: INK, marginTop: 28, letterSpacing: -2 }}>
              {price(l.price)}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', fontSize: 24, fontWeight: 500, color: MUTE }}>
          {l?.seller?.username ? <div style={{ display: 'flex', color: INK }}>@{l.seller.username}</div> : null}
          <div style={{ display: 'flex', marginTop: 6 }}>Buyer Protection on every order</div>
          <div style={{ display: 'flex', marginTop: 4 }}>app.grabsty.com</div>
        </div>
      </div>
    </div>
  );

  return new ImageResponse(card, {
    width: 1200,
    height: 630,
    fonts: f,
    headers: {
      // Crawlers fetch once and cache; price/sold changes show up within the hour.
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
