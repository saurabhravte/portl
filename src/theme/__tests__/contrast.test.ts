import { darkColors, lightColors, type ThemeColors } from "../tokens";

/** Relative luminance per WCAG 2.1. */
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const channels = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const AA = 4.5;

/**
 * Guards the palette contract described in src/global.css.
 *
 * The raw fill tokens (primary, warn, …) are deliberately NOT tested as text:
 * they fail AA in light mode by design, which is exactly why the *Text
 * variants exist. If someone "simplifies" the palette by pointing a *Text
 * token back at its fill, these tests fail.
 */
describe.each([
  ["light", lightColors],
  ["dark", darkColors],
] as const)("%s palette", (_scheme, palette: ThemeColors) => {
  const surfaces = [palette.paper, palette.surface, palette.surfaceAlt];

  const bodyText = ["ink", "inkSoft", "inkMuted"] as const;
  it.each(bodyText)("%s meets AA on every surface", (token) => {
    for (const bg of surfaces) {
      expect(contrast(palette[token], bg)).toBeGreaterThanOrEqual(AA);
    }
  });

  const semanticText = [
    "primaryText",
    "accentText",
    "approveText",
    "denyText",
    "warnText",
    "infoText",
  ] as const;
  it.each(semanticText)("%s meets AA on paper and surface", (token) => {
    expect(contrast(palette[token], palette.paper)).toBeGreaterThanOrEqual(AA);
    expect(contrast(palette[token], palette.surface)).toBeGreaterThanOrEqual(AA);
  });

  const fills = [
    ["onPrimary", "primary"],
    ["onAccent", "accent"],
    ["onApprove", "approve"],
    ["onDeny", "deny"],
    ["onWarn", "warn"],
    ["onInfo", "info"],
  ] as const;
  it.each(fills)("%s is legible on %s", (label, fill) => {
    expect(contrast(palette[label], palette[fill])).toBeGreaterThanOrEqual(AA);
  });

  const tints = [
    ["approveText", "approveBg"],
    ["denyText", "denyBg"],
    ["warnText", "warnBg"],
    ["primaryText", "primarySoft"],
    ["accentText", "accentSoft"],
    ["infoText", "infoSoft"],
  ] as const;
  it.each(tints)("%s is legible on its %s tint", (fg, bg) => {
    expect(contrast(palette[fg], palette[bg])).toBeGreaterThanOrEqual(AA);
  });

  it("keeps every token a valid 6-digit hex", () => {
    for (const value of Object.values(palette)) {
      expect(value).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});
