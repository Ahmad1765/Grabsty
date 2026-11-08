import React from 'react';
import Svg, { Path, Circle, Line } from 'react-native-svg';

export interface TabIconProps {
  size?: number;
  color: string;
  /** Background color of the bar — used for knockout shapes inside filled active icons. */
  bgColor?: string;
  active?: boolean;
}

// ---------------------------------------------------------------------------
// Home — Filled house (active) / Outlined house (inactive)
// Based on home-house-ui-svgrepo-com.svg
// ---------------------------------------------------------------------------
export function HomeTabIcon({ size = 24, color, active = false }: TabIconProps) {
  if (active) {
    return (
      <Svg width={size} height={size} viewBox="0 0 512 512" fill="none">
        <Path
          d="M500.284,227.716l-216-216c-15.621-15.621-40.948-15.621-56.568,0h0l-216,216c-15.621,15.621-15.621,40.948,0,56.568 C23.69,296.258,41.363,299.042,56,292.659V452c0,33.137,26.863,60,60,60h280c33.137,0,60-26.863,60-60V292.659 c14.637,6.383,32.31,3.599,44.284-8.375h0C515.905,268.663,515.905,243.337,500.284,227.716z M326,432c0,11.046-8.954,20-20,20H206 c-11.046,0-20-8.954-20-20V312c0-11.046,8.954-20,20-20h100c11.046,0,20,8.954,20,20V432z"
          fill={color}
          fillRule="evenodd"
        />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512" fill="none">
      <Path
        d="M484,236 L278,30 C266,18 246,18 234,30 L28,236 C20,244 26,258 38,258 L68,258 C72,258 76,262 76,266 L76,448 C76,470 94,488 116,488 L396,488 C418,488 436,470 436,448 L436,266 C436,262 440,258 444,258 L474,258 C486,258 492,244 484,236 Z"
        stroke={color}
        strokeWidth={36}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Path
        d="M196,488 V332 C196,316 209,303 225,303 L287,303 C303,303 316,316 316,332 V488"
        stroke={color}
        strokeWidth={36}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Categories — Search Refraction Magnifying glass.
// Based on search-refraction-svgrepo-com.svg
// ---------------------------------------------------------------------------
export function CategoriesTabIcon({ size = 24, color, active = false }: TabIconProps) {
  const sw = active ? 2.3 : 1.8;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 21L16.65 16.65M11 6C13.7614 6 16 8.23858 16 11M19 11C19 15.4183 15.4183 19 11 19C6.58172 19 3 15.4183 3 11C3 6.58172 6.58172 3 11 3C15.4183 3 19 6.58172 19 11Z"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
// ---------------------------------------------------------------------------
// Sell — Plus in a circle.
// Reference: thin-walled circle, centred + crosshairs.
// Active = filled circle with knockout plus / Inactive = outlined.
// ---------------------------------------------------------------------------
export function SellTabIcon({ size = 24, color, bgColor, active = false }: TabIconProps) {
  if (active) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={10} fill={color} />
        <Line x1={12} y1={7} x2={12} y2={17} stroke={bgColor ?? '#1C1C1C'} strokeWidth={2.4} strokeLinecap="round" />
        <Line x1={7} y1={12} x2={17} y2={12} stroke={bgColor ?? '#1C1C1C'} strokeWidth={2.4} strokeLinecap="round" />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9.5} stroke={color} strokeWidth={1.8} />
      <Line x1={12} y1={7.5} x2={12} y2={16.5} stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Line x1={7.5} y1={12} x2={16.5} y2={12} stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Inbox — Speech bubble with heart inside.
// Based on chat.png (custom heart speech bubble)
// Active = filled bubble with knockout heart / Inactive = outlined bubble + filled heart.
// ---------------------------------------------------------------------------
const CHAT_BUBBLE_PATH =
  'M 66 41.555 C 42.634 46.573, 22.423 66.970, 17.499 90.500 C 15.309 100.970, 15.309 347.030, 17.499 357.500 C 21.307 375.697, 34.383 392.566, 51.064 400.799 C 61.840 406.118, 70.479 407.961, 84.750 407.983 L 96 408 96 433.532 C 96 461.621, 96.332 463.577, 101.893 468.257 C 105.548 471.332, 110.402 472.496, 115.750 471.580 C 119.046 471.016, 123.251 467.130, 150.500 439.463 L 181.500 407.988 310 407.977 C 453.506 407.964, 445.827 408.326, 460.966 400.862 C 477.369 392.776, 490.774 375.447, 494.509 357.500 C 496.685 347.041, 496.685 100.959, 494.509 90.500 C 490.774 72.553, 477.369 55.224, 460.966 47.138 C 445.570 39.548, 459.569 40.028, 255.500 40.097 C 102.835 40.149, 71.423 40.390, 66 41.555 Z';

const CHAT_HEART_PATH =
  'M 204.225 145.522 C 177.426 151.342, 158.052 176.172, 160.309 201.803 C 161.104 210.837, 163.187 217.279, 167.816 225.020 C 170.995 230.337, 178.404 237.753, 209.095 266.340 C 229.668 285.503, 247.948 301.815, 249.718 302.590 C 253.602 304.292, 258.527 304.337, 262.244 302.705 C 265.131 301.438, 332.582 239.535, 338.966 232.294 C 357.173 211.645, 355.923 180.854, 336.072 161.003 C 316.151 141.082, 284.408 138.551, 260.532 154.978 L 256 158.096 251.468 154.978 C 237.628 145.456, 220.403 142.008, 204.225 145.522 Z';

export function InboxTabIcon({ size = 24, color, bgColor, active = false }: TabIconProps) {
  if (active) {
    return (
      <Svg width={size} height={size} viewBox="0 0 512 512" fill="none">
        <Path d={`${CHAT_BUBBLE_PATH} ${CHAT_HEART_PATH}`} fill={color} fillRule="evenodd" />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512" fill="none">
      <Path
        d={CHAT_BUBBLE_PATH}
        stroke={color}
        strokeWidth={36}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Path d={CHAT_HEART_PATH} fill={color} />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Account — Person silhouette inside a circle.
// Active = filled circle with knockout head + shoulder / Inactive = outlined.
// ---------------------------------------------------------------------------
export function AccountTabIcon({ size = 24, color, bgColor, active = false }: TabIconProps) {
  if (active) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={10} fill={color} />
        <Circle cx={12} cy={9.5} r={3.2} fill={bgColor ?? '#1C1C1C'} />
        <Path
          d="M6.2 18.5c.7-2.8 3-4.5 5.8-4.5s5.1 1.7 5.8 4.5"
          stroke={bgColor ?? '#1C1C1C'}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9.5} stroke={color} strokeWidth={1.8} />
      <Circle cx={12} cy={9.5} r={3.2} stroke={color} strokeWidth={1.8} />
      <Path
        d="M6.2 18.5c.7-2.8 3-4.5 5.8-4.5s5.1 1.7 5.8 4.5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}
