import React from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTheme } from '@/context/ThemeContext';
import { BRAND } from '@/lib/brand';
import {
  LOGOMARK_INK,
  LOGOMARK_FACE,
  LOGOMARK_BOX,
  LOGOTYPE,
  LOGOTYPE_BOX,
} from './brandMarks';

// Official brand colours (Brand Assets/COLOR CODES.pdf). They belong to the
// logo artwork itself, the same tile the favicon and app icon use, and are not
// UI palette tokens.
export const BRAND_MARK_PURPLE = '#5A59EE';
const BRAND_MARK_INK = '#231F20';

// The favicon's tile around the mark: the mark fills ~77% of the tile height,
// sits a touch above centre, and the corners are ~21% of the side.
const TILE = 2000;
const TILE_X = LOGOMARK_BOX.x + LOGOMARK_BOX.width / 2 - TILE / 2;
const TILE_Y = LOGOMARK_BOX.y + LOGOMARK_BOX.height / 2 - TILE * 0.469;
const TILE_RADIUS = TILE * 0.21;

export interface GrabstyLogoProps {
  size?: number;
  variant?: 'mark' | 'full';
  /** Tile colour behind the mark. */
  markBg?: string;
  /** Logotype colour (full variant). Defaults to theme ink. */
  textColor?: string;
  style?: ViewStyle;
}

/**
 * Grabsty brand logo, drawn from the official vector artwork.
 * - 'mark': the favicon / app-icon tile (G-arrow on Grabsty Purple)
 * - 'full': the tile plus the official "Grabsty" logotype
 */
export function GrabstyLogo({
  size = 28,
  variant = 'mark',
  markBg = BRAND_MARK_PURPLE,
  textColor,
  style,
}: GrabstyLogoProps) {
  const { theme } = useTheme();

  const mark = (
    <Svg
      width={size}
      height={size}
      viewBox={`${TILE_X} ${TILE_Y} ${TILE} ${TILE}`}
      accessibilityLabel={BRAND}
    >
      <Rect x={TILE_X} y={TILE_Y} width={TILE} height={TILE} rx={TILE_RADIUS} fill={markBg} />
      {LOGOMARK_INK.map((p, i) => (
        <Path key={i} transform={p.transform} d={p.d} fill={BRAND_MARK_INK} />
      ))}
      <Path transform={LOGOMARK_FACE.transform} d={LOGOMARK_FACE.d} fill="#FFFFFF" />
    </Svg>
  );

  if (variant === 'mark') {
    return <View style={style}>{mark}</View>;
  }

  // Logotype box includes the "y" descender, so at the mark's height the
  // letters' body lines up with the tile.
  const typeHeight = size;
  const typeWidth = (typeHeight * LOGOTYPE_BOX.width) / LOGOTYPE_BOX.height;

  return (
    <View style={[{ flexDirection: 'row', alignItems: 'flex-start', gap: Math.round(size * 0.28) }, style]}>
      {mark}
      <Svg
        width={typeWidth}
        height={typeHeight}
        viewBox={`${LOGOTYPE_BOX.x} ${LOGOTYPE_BOX.y} ${LOGOTYPE_BOX.width} ${LOGOTYPE_BOX.height}`}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {LOGOTYPE.map((p, i) => (
          <Path key={i} transform={p.transform} d={p.d} fill={textColor ?? theme.ink} />
        ))}
      </Svg>
    </View>
  );
}
