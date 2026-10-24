import React from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme } from '@/context/ThemeContext';

export interface FilterSlidersIconProps {
  size?: number;
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  style?: ViewStyle;
}

/**
 * Canonical 3-Track Horizontal Sliders Icon for Grabsty.
 *
 * Design Spec:
 * - 3 horizontal tracks with hollow circular slider knobs matching the quiet atelier aesthetic
 * - Top Track (y=7): knob on right (cx=15.5, cy=7, r=1.9)
 * - Middle Track (y=12): knob on left (cx=8.5, cy=12, r=1.9)
 * - Bottom Track (y=17): knob on right (cx=15.5, cy=17, r=1.9)
 * - Standard 24x24 viewBox for optical harmony alongside Feather and Ionicons
 * - Continuous lines connect seamlessly to the knobs without broken gaps
 */
const TRACKS_PATH = 'M4 7h9.6 M17.4 7H20 M4 12h2.6 M10.4 12H20 M4 17h9.6 M17.4 17H20';

export function FilterSlidersIcon({
  size = 19,
  width,
  height,
  color,
  strokeWidth = 1.65,
  style,
}: FilterSlidersIconProps) {
  const { theme } = useTheme();
  const w = width ?? size;
  const h = height ?? size;
  const strokeColor = color ?? theme.ink;

  return (
    <View style={[{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg
        width={w}
        height={h}
        viewBox="0 0 24 24"
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Path d={TRACKS_PATH} />
        <Circle cx={15.5} cy={7} r={1.9} />
        <Circle cx={8.5} cy={12} r={1.9} />
        <Circle cx={15.5} cy={17} r={1.9} />
      </Svg>
    </View>
  );
}
