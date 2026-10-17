import { View } from 'react-native';
import { getItemColor } from '@/lib/itemColors';

const HAIR = 'rgba(15,15,15,0.15)';
// Light swatches (white, cream, pale grey) vanish against a white card behind
// a faint hairline — they read as an empty/unselected radio. Give them a
// firmer gray-300 ring + a soft shadow so they land as a filled chip.
const LIGHT_RING = '#D1D5DB';

/** Perceived luminance (0..1) from a #rrggbb hex, for the light-swatch test. */
function isLightHex(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.85;
}
// Fixed quadrant colours for the multicolour swatch — a 2x2 fill (not a
// gradient, so it stays within the brand's flat-colour rule).
const MULTI_QUAD = ['#D7373F', '#F2C230', '#3FA463', '#3A6FE0'];

export function ColorSwatch({
  colorId,
  size = 18,
}: {
  colorId: string | null | undefined;
  size?: number;
}) {
  const c = getItemColor(colorId);
  if (!c) return null;
  const radius = size / 2;

  if (c.hex === null) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: HAIR,
          flexDirection: 'row',
          flexWrap: 'wrap',
        }}
      >
        {MULTI_QUAD.map((h, i) => (
          <View key={i} style={{ width: '50%', height: '50%', backgroundColor: h }} />
        ))}
      </View>
    );
  }

  const light = isLightHex(c.hex);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: c.hex,
        borderWidth: 1,
        borderColor: light ? LIGHT_RING : HAIR,
        ...(light ? { boxShadow: '0px 1px 2px rgba(0,0,0,0.10)' } : null),
      }}
    />
  );
}
