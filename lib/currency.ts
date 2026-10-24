// Single source of truth for how money is shown across the app. Grabsty trades
// in Pakistani Rupees (PKR), so every price, fee, offer, and total routes
// through here — the symbol and formatting can never drift between screens.
//
// Values are stored as plain numbers; this module only controls presentation.
// Whole amounts render without decimals (Rs 1,250); fractional amounts keep two
// (Rs 1.75), so the Buyer Protection breakdown still reads cleanly.

export const CURRENCY_SYMBOL = 'Rs';
export const CURRENCY_CODE = 'PKR';

// Number formatters are built once and reused.
//
// `Number.prototype.toLocaleString(locale, opts)` constructs a fresh formatter
// on every call, and on Hermes that is a JSI hop into the platform number
// formatter (ICU on Android, Foundation on iOS). formatPrice runs three times
// per ListingCard render — accessibility label, item price, total — so a
// recycling feed grid paid hundreds of those round-trips per scroll, all on the
// JS thread. A cached Intl.NumberFormat produces byte-identical output for the
// same locale + options, so this is purely a cost change.
type Formatter = { format: (n: number) => string };

function makeFormatter(options?: Intl.NumberFormatOptions): Formatter {
  try {
    return new Intl.NumberFormat('en-US', options);
  } catch {
    // No Intl (or no en-US data) in this engine — fall back to the per-call
    // API, which is what this module used before.
    return { format: (n: number) => n.toLocaleString('en-US', options) };
  }
}

// Built lazily so importing this module costs nothing at startup.
let plainFmt: Formatter | null = null;
let fixed2Fmt: Formatter | null = null;
let upTo2Fmt: Formatter | null = null;

// `whole: true` rounds to the nearest rupee and never shows decimals — used on
// browsing surfaces (grid cards, product headline) where sub-rupee precision is
// noise. Leave it off for the Buyer Protection breakdown, where a seller's
// fractional asking price has to add up against the total shown beneath it.
export function formatPrice(
  amount: number | string | null | undefined,
  opts?: { whole?: boolean; forceDecimals?: boolean },
): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
  if (!Number.isFinite(n)) return `${CURRENCY_SYMBOL} 0`;
  if (opts?.whole) {
    plainFmt ??= makeFormatter();
    return `${CURRENCY_SYMBOL} ${plainFmt.format(Math.round(n))}`;
  }
  if (opts?.forceDecimals) {
    fixed2Fmt ??= makeFormatter({ minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${CURRENCY_SYMBOL} ${fixed2Fmt.format(n)}`;
  }
  const hasFraction = Math.round(n * 100) % 100 !== 0;
  let fmt: Formatter;
  if (hasFraction) {
    fmt = fixed2Fmt ??= makeFormatter({ minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } else {
    fmt = upTo2Fmt ??= makeFormatter({ minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  return `${CURRENCY_SYMBOL} ${fmt.format(n)}`;
}
