import { describe, it, expect, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'web' }, useWindowDimensions: () => ({ width: 390, height: 844 }) }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

import { fitCardWidth } from './responsive';

describe('fitCardWidth', () => {
  const browse = { horizontalPadding: 16, gap: 8 };

  it('keeps the estimate until the grid has been measured', () => {
    expect(fitCardWidth(0, 175, browse)).toBe(175);
  });

  it('shrinks cards so two still fit when the grid is narrower than the window', () => {
    // 390 window estimate, but a 15px scrollbar leaves 375 for the grid.
    const w = fitCardWidth(375, 175, browse);
    expect(w * 2 + 8 + 32).toBeLessThanOrEqual(375);
    expect(w).toBe(167);
  });

  it('never grows past the estimate (desktop caps hold)', () => {
    // Browse on desktop: 600px column, estimate already exact.
    expect(fitCardWidth(600, 280, browse)).toBe(280);
    expect(fitCardWidth(640, 280, browse)).toBe(280);
  });

  it('respects a fixed column count for row grids', () => {
    const w = fitCardWidth(380, 179, { horizontalPadding: 12, gap: 8, columns: 2 });
    expect(w * 2 + 8 + 24).toBeLessThanOrEqual(380);
  });
});
