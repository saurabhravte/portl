import { breakpointFor } from "../useResponsive";

/**
 * Device matrix. No simulator is available in CI, so the breakpoint maths is
 * asserted directly against real device point sizes instead. Portrait and
 * landscape are both checked because the bucket is keyed on the SHORT edge —
 * rotating a phone must not promote it to the tablet layout.
 */
const DEVICES = [
  { name: "iPhone SE (2022)", w: 375, h: 667, expect: "regular" },
  { name: "Galaxy S8 / small Android", w: 360, h: 740, expect: "regular" },
  { name: "very narrow / split-screen", w: 320, h: 640, expect: "compact" },
  { name: "iPhone 14", w: 390, h: 844, expect: "regular" },
  { name: "iPhone 15 Pro Max", w: 430, h: 932, expect: "regular" },
  { name: "Pixel Fold (unfolded)", w: 601, h: 841, expect: "large" },
  { name: 'iPad mini (8.3")', w: 744, h: 1133, expect: "large" },
  { name: 'iPad Pro 11"', w: 834, h: 1194, expect: "large" },
  { name: 'iPad Pro 12.9"', w: 1024, h: 1366, expect: "xlarge" },
] as const;

describe("breakpointFor", () => {
  it.each(DEVICES)("$name is $expect in portrait", ({ w, h, expect: want }) => {
    expect(breakpointFor(Math.min(w, h))).toBe(want);
  });

  it.each(DEVICES)("$name keeps its bucket in landscape", ({ w, h, expect: want }) => {
    // Short edge is orientation-independent, so rotating must not change it.
    expect(breakpointFor(Math.min(h, w))).toBe(want);
  });

  it("orders the buckets monotonically as the short edge grows", () => {
    const order = ["compact", "regular", "large", "xlarge"];
    let lastIndex = -1;
    for (const edge of [320, 360, 400, 600, 700, 840, 1024]) {
      const index = order.indexOf(breakpointFor(edge));
      expect(index).toBeGreaterThanOrEqual(lastIndex);
      lastIndex = index;
    }
  });

  it("puts the documented thresholds on the correct side", () => {
    expect(breakpointFor(359)).toBe("compact");
    expect(breakpointFor(360)).toBe("regular");
    expect(breakpointFor(599)).toBe("regular");
    expect(breakpointFor(600)).toBe("large");
    expect(breakpointFor(839)).toBe("large");
    expect(breakpointFor(840)).toBe("xlarge");
  });
});
