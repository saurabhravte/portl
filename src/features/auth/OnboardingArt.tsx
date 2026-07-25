import React from "react";
import Svg, {
  Circle,
  G,
  Line,
  Path,
  Rect,
} from "react-native-svg";

/**
 * Onboarding illustrations — Phase 4.3 / 4.4.
 *
 * Line art, two tones, no fills beyond the background. This replaces the
 * 842 KB `onboarding-gate.png` raster that shipped before: vectors scale to
 * any density, cost ~2 KB of JS, need no @2x/@3x variants, and recolour with
 * the theme instead of baking a palette into pixels.
 *
 * Colours come in as props from the onboard-* tokens so the whole set inverts
 * to white-on-black in dark mode without a second copy of the artwork.
 */

export interface IllustrationProps {
  size: number;
  ink: string;
  muted: string;
  background: string;
}

const STROKE = 2;

/** Slide 1 — a gate and the homes behind it. */
export function WelcomeArt({ size, ink, muted, background }: IllustrationProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200" fill="none">
      <Circle cx="100" cy="100" r="88" fill={background} />

      {/* Skyline behind the gate */}
      <G stroke={muted} strokeWidth={STROKE} strokeLinejoin="round">
        <Path d="M38 108V76l20-14 20 14v32" />
        <Path d="M122 108V70l22-15 22 15v38" />
        <Rect x="50" y="86" width="7" height="7" />
        <Rect x="62" y="86" width="7" height="7" />
        <Rect x="134" y="80" width="8" height="8" />
        <Rect x="148" y="80" width="8" height="8" />
      </G>

      {/* Gate posts and boom barrier */}
      <G stroke={ink} strokeWidth={STROKE} strokeLinecap="round">
        <Line x1="34" y1="150" x2="34" y2="108" />
        <Line x1="166" y1="150" x2="166" y2="108" />
        <Rect x="26" y="100" width="16" height="10" rx="2" />
        <Rect x="158" y="100" width="16" height="10" rx="2" />
        <Line x1="42" y1="124" x2="158" y2="124" />
        <Line x1="64" y1="124" x2="64" y2="118" />
        <Line x1="88" y1="124" x2="88" y2="118" />
        <Line x1="112" y1="124" x2="112" y2="118" />
        <Line x1="136" y1="124" x2="136" y2="118" />
        <Line x1="20" y1="150" x2="180" y2="150" />
      </G>

      {/* Approval tick over the gate */}
      <G>
        <Circle cx="100" cy="74" r="20" fill={background} stroke={ink} strokeWidth={STROKE} />
        <Path
          d="M91 74l6 6 12-13"
          stroke={ink}
          strokeWidth={STROKE + 0.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </G>
    </Svg>
  );
}

/** Slide 2 — a visitor request arriving on a phone. */
export function ApproveArt({ size, ink, muted, background }: IllustrationProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200" fill="none">
      <Circle cx="100" cy="100" r="88" fill={background} />

      {/* Phone */}
      <Rect
        x="58"
        y="30"
        width="84"
        height="140"
        rx="14"
        fill={background}
        stroke={ink}
        strokeWidth={STROKE}
      />
      <Line x1="88" y1="42" x2="112" y2="42" stroke={muted} strokeWidth={STROKE} strokeLinecap="round" />

      {/* Visitor card */}
      <Rect x="70" y="58" width="60" height="46" rx="8" stroke={muted} strokeWidth={STROKE} />
      <Circle cx="86" cy="76" r="9" stroke={ink} strokeWidth={STROKE} />
      <Path d="M77 92c2-6 5-8 9-8s7 2 9 8" stroke={ink} strokeWidth={STROKE} strokeLinecap="round" />
      <Line x1="102" y1="72" x2="122" y2="72" stroke={muted} strokeWidth={STROKE} strokeLinecap="round" />
      <Line x1="102" y1="82" x2="116" y2="82" stroke={muted} strokeWidth={STROKE} strokeLinecap="round" />

      {/* Approve / deny actions */}
      <G>
        <Rect x="70" y="116" width="27" height="24" rx="7" fill={ink} />
        <Path
          d="M78 128l4 4 8-9"
          stroke={background}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Rect x="103" y="116" width="27" height="24" rx="7" stroke={muted} strokeWidth={STROKE} />
        <Path
          d="M111 123l11 11M122 123l-11 11"
          stroke={muted}
          strokeWidth={STROKE}
          strokeLinecap="round"
        />
      </G>

      {/* One-tap ripple */}
      <Circle cx="83" cy="128" r="22" stroke={ink} strokeWidth="1.5" opacity="0.45" />
      <Circle cx="83" cy="128" r="32" stroke={ink} strokeWidth="1.5" opacity="0.2" />
    </Svg>
  );
}

/** Slide 3 — notifications, notices and payments in one feed. */
export function NotifyArt({ size, ink, muted, background }: IllustrationProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200" fill="none">
      <Circle cx="100" cy="100" r="88" fill={background} />

      {/* Bell */}
      <G stroke={ink} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M100 40c-16 0-27 12-27 28 0 20-6 26-10 31h74c-4-5-10-11-10-31 0-16-11-28-27-28z" />
        <Line x1="100" y1="32" x2="100" y2="40" />
        <Path d="M89 106c1 6 5 10 11 10s10-4 11-10" />
      </G>
      <Circle cx="130" cy="52" r="9" fill={ink} />

      {/* Stacked notification rows */}
      <G>
        <Rect
          x="46"
          y="126"
          width="108"
          height="20"
          rx="6"
          fill={background}
          stroke={ink}
          strokeWidth={STROKE}
        />
        <Circle cx="59" cy="136" r="4" fill={ink} />
        <Line x1="70" y1="136" x2="140" y2="136" stroke={muted} strokeWidth={STROKE} strokeLinecap="round" />

        <Rect x="52" y="150" width="96" height="16" rx="5" stroke={muted} strokeWidth={STROKE} />
        <Line x1="64" y1="158" x2="134" y2="158" stroke={muted} strokeWidth={STROKE} strokeLinecap="round" />

        <Rect x="60" y="170" width="80" height="10" rx="4" stroke={muted} strokeWidth="1.5" opacity="0.5" />
      </G>
    </Svg>
  );
}

export const ONBOARDING_ART = {
  welcome: WelcomeArt,
  approve: ApproveArt,
  notify: NotifyArt,
} as const;

export type OnboardingArtKey = keyof typeof ONBOARDING_ART;
