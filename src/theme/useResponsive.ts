import { useWindowDimensions } from "react-native";

/**
 * Device buckets, measured on the *shortest* edge so a phone stays a phone in
 * landscape. Thresholds follow the common Android/iOS dp breakpoints:
 *
 *   compact  < 360dp  — iPhone SE / small Androids
 *   regular  < 600dp  — the vast majority of phones
 *   large    < 840dp  — Pro Max phones, small tablets, foldables opened
 *   xlarge  >= 840dp  — iPad / 10"+ tablets
 */
export type Breakpoint = "compact" | "regular" | "large" | "xlarge";

export interface Responsive {
  width: number;
  height: number;
  breakpoint: Breakpoint;
  isLandscape: boolean;
  /** True from `large` up — use to switch to multi-column or capped layouts. */
  isWide: boolean;
  isTablet: boolean;
  /** Horizontal gutter that grows with the viewport. */
  gutter: number;
  /** Max content width; keeps text measure readable on tablets. */
  contentMaxWidth: number;
  /** Sensible column count for card grids at this size. */
  columns: number;
  /**
   * Scale a phone-designed dimension to the current viewport, clamped so
   * nothing collapses on an SE or balloons on an iPad.
   */
  scale: (value: number, min?: number, max?: number) => number;
}

const BASELINE_WIDTH = 390; // iPhone 14 — the width the UI was designed at

export function breakpointFor(shortEdge: number): Breakpoint {
  if (shortEdge < 360) return "compact";
  if (shortEdge < 600) return "regular";
  if (shortEdge < 840) return "large";
  return "xlarge";
}

/**
 * Layout facts for the current window. Backed by `useWindowDimensions`, so it
 * re-renders on rotation, split-screen resize and foldable unfold — unlike
 * `Dimensions.get()`, which snapshots once at module load.
 */
export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();
  const shortEdge = Math.min(width, height);
  const breakpoint = breakpointFor(shortEdge);
  const isLandscape = width > height;
  const isWide = breakpoint === "large" || breakpoint === "xlarge";
  const isTablet = breakpoint === "xlarge";

  const gutter = breakpoint === "compact" ? 16 : isTablet ? 32 : 24;
  const contentMaxWidth = isTablet ? 720 : isWide ? 600 : width;
  const columns = isTablet ? 3 : isWide || isLandscape ? 2 : 1;

  const scale = (value: number, min?: number, max?: number) => {
    const scaled = (value * width) / BASELINE_WIDTH;
    const lower = min ?? value * 0.85;
    const upper = max ?? value * 1.35;
    return Math.round(Math.min(Math.max(scaled, lower), upper));
  };

  return {
    width,
    height,
    breakpoint,
    isLandscape,
    isWide,
    isTablet,
    gutter,
    contentMaxWidth,
    columns,
    scale,
  };
}
