import { readFileSync } from "fs";
import { join } from "path";
import { darkColors, lightColors, type ThemeColors } from "../tokens";

/**
 * tokens.ts mirrors global.css by hand. Nothing in the type system enforces
 * that, and a mismatch is invisible in review: the app looks right because
 * almost everything is styled with classNames, and the drift only shows up as
 * a single wrong-coloured spinner or status bar in one scheme.
 *
 * This parses both files and fails on any divergence.
 */

const CSS = readFileSync(
  join(__dirname, "..", "..", "global.css"),
  "utf8",
);

function parseCssBlock(source: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /--color-([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    map.set(match[1], match[2].toLowerCase());
  }
  return map;
}

const darkStart = CSS.indexOf("prefers-color-scheme: dark");
const lightCss = parseCssBlock(CSS.slice(0, darkStart));
const darkCss = parseCssBlock(CSS.slice(darkStart));

/** `surface-alt` -> `surfaceAlt`, `on-primary` -> `onPrimary`. */
const camel = (kebab: string) =>
  kebab.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

describe("global.css is parsed correctly", () => {
  it("finds a non-trivial number of tokens in both blocks", () => {
    expect(lightCss.size).toBeGreaterThan(30);
    expect(darkCss.size).toBeGreaterThan(30);
  });
});

describe.each([
  ["light", lightCss, lightColors],
  ["dark", darkCss, darkColors],
] as const)("%s: tokens.ts mirrors global.css", (_scheme, css, ts: ThemeColors) => {
  it("agrees on every value the JS side declares", () => {
    const mismatches: string[] = [];
    for (const [cssKey, cssValue] of css) {
      const tsKey = camel(cssKey) as keyof ThemeColors;
      const tsValue = ts[tsKey];
      // Not every CSS variable needs a JS counterpart — only flag disagreement.
      if (tsValue && tsValue.toLowerCase() !== cssValue) {
        mismatches.push(
          `--color-${cssKey}: css=${cssValue} ts=${tsValue.toLowerCase()}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("has a CSS variable behind every JS token", () => {
    const orphans = Object.keys(ts).filter((tsKey) => {
      const kebab = tsKey.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`);
      return !css.has(kebab);
    });
    expect(orphans).toEqual([]);
  });
});

describe("light and dark are complete counterparts", () => {
  it("gives every light token a dark override", () => {
    const missing = [...lightCss.keys()].filter((key) => !darkCss.has(key));
    expect(missing).toEqual([]);
  });

  it("does not define dark-only tokens", () => {
    const extra = [...darkCss.keys()].filter((key) => !lightCss.has(key));
    expect(extra).toEqual([]);
  });

  it("declares the same token set on the JS side", () => {
    expect(Object.keys(lightColors).sort()).toEqual(
      Object.keys(darkColors).sort(),
    );
  });
});
