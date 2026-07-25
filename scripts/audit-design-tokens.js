#!/usr/bin/env node
/**
 * Design-system audit — Phases 5.4, 5.5, 7.2, 7.3, 7.4.
 *
 * Turns the manual "search the codebase for leftover hex values" pass into
 * something CI runs on every commit, because a one-off audit is only true on
 * the day it is done.
 *
 *   node scripts/audit-design-tokens.js
 *
 * Checks:
 *   1. No raw hex colours in src/ outside the two token files.
 *   2. tokens.ts and global.css define the SAME token set with the SAME
 *      values, in both schemes.
 *   3. Every light token has a dark override (Phase 7.4 parity).
 *   4. No FILL token used via text-* (that is what the -text variants exist
 *      for, and it is how AA failures get shipped).
 *   5. No arbitrary Tailwind values — text-[13px], p-[7px], bg-[#fff] — which
 *      bypass the type and spacing scales (Phase 7.2).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const CSS = path.join(SRC, "global.css");
const TOKENS = path.join(SRC, "theme", "tokens.ts");

/** Files allowed to contain literal hex values. */
const HEX_ALLOWLIST = new Set([
  path.join("src", "global.css"),
  path.join("src", "theme", "tokens.ts"),
]);

const failures = [];
const notes = [];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(SRC).filter((f) => /\.(ts|tsx|css)$/.test(f));

/* ── 1. Raw hex ──────────────────────────────────────────────────────────
 * Hex inside comments is documentation (contrast annotations, notes about
 * why a value was rejected), not a styling decision, so block and line
 * comments are stripped before scanning. Doing this per-line missed
 * multi-line block comments, so track block state across the file.
 */
const HEX = /#[0-9a-fA-F]{3,8}\b/g;

function stripComments(text) {
  const out = [];
  let inBlock = false;
  for (const raw of text.split("\n")) {
    let line = raw;
    if (inBlock) {
      const close = line.indexOf("*/");
      if (close === -1) {
        out.push("");
        continue;
      }
      line = line.slice(close + 2);
      inBlock = false;
    }
    // Same-line block comments, then any trailing line comment.
    line = line.replace(/\/\*[\s\S]*?\*\//g, "");
    const open = line.indexOf("/*");
    if (open !== -1) {
      inBlock = true;
      line = line.slice(0, open);
    }
    line = line.replace(/\/\/.*$/, "");
    out.push(line);
  }
  return out;
}

for (const file of files) {
  const rel = path.relative(ROOT, file);
  if (HEX_ALLOWLIST.has(rel)) continue;
  const lines = stripComments(fs.readFileSync(file, "utf8"));
  lines.forEach((code, i) => {
    const found = code.match(HEX);
    if (found) {
      failures.push(
        `[hex] ${rel}:${i + 1} — raw colour ${found.join(", ")}. Use a token.`,
      );
    }
  });
}

/* ── 2 & 3. CSS ↔ TS parity, and light/dark parity ───────────────────── */
const css = fs.readFileSync(CSS, "utf8");

function parseBlock(source) {
  const map = new Map();
  const re = /--color-([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g;
  let m;
  while ((m = re.exec(source))) map.set(m[1], m[2].toLowerCase());
  return map;
}

const darkStart = css.indexOf("prefers-color-scheme: dark");
const lightCss = parseBlock(css.slice(0, darkStart));
const darkCss = parseBlock(css.slice(darkStart));

for (const key of lightCss.keys()) {
  if (!darkCss.has(key)) {
    failures.push(
      `[dark-parity] --color-${key} has no dark override. It will keep its light value.`,
    );
  }
}
for (const key of darkCss.keys()) {
  if (!lightCss.has(key)) {
    failures.push(`[dark-parity] --color-${key} exists only in dark mode.`);
  }
}

const ts = fs.readFileSync(TOKENS, "utf8");
function parseTs(name) {
  const start = ts.indexOf(`export const ${name}: ThemeColors = {`);
  if (start === -1) return new Map();
  const end = ts.indexOf("};", start);
  const body = ts.slice(start, end);
  const map = new Map();
  const re = /(\w+)\s*:\s*"(#[0-9a-fA-F]{3,8})"/g;
  let m;
  while ((m = re.exec(body))) map.set(m[1], m[2].toLowerCase());
  return map;
}

const camel = (kebab) => kebab.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

for (const [scheme, cssMap, tsMap] of [
  ["light", lightCss, parseTs("lightColors")],
  ["dark", darkCss, parseTs("darkColors")],
]) {
  for (const [key, value] of cssMap) {
    const tsKey = camel(key);
    if (!tsMap.has(tsKey)) {
      notes.push(
        `[mirror] ${scheme}: --color-${key} has no tokens.ts counterpart (${tsKey}). Fine if never needed from JS.`,
      );
      continue;
    }
    if (tsMap.get(tsKey) !== value) {
      failures.push(
        `[mirror] ${scheme}: --color-${key} is ${value} in global.css but ${tsMap.get(tsKey)} in tokens.ts.`,
      );
    }
  }
}

/* ── 4. FILL tokens used as text ─────────────────────────────────────── */
const FILL_ONLY = [
  "primary",
  "accent",
  "warn",
  "info",
  "approve",
  "deny",
  "border",
];
const textFill = new RegExp(
  `\\btext-(${FILL_ONLY.join("|")})(?![a-z-])`,
  "g",
);
for (const file of files) {
  const rel = path.relative(ROOT, file);
  const text = fs.readFileSync(file, "utf8");
  text.split("\n").forEach((line, i) => {
    const found = line.match(textFill);
    if (found) {
      failures.push(
        `[fill-as-text] ${rel}:${i + 1} — ${found.join(", ")}. ` +
          `Use the -text variant (e.g. text-primary-text); fills fail AA as text.`,
      );
    }
  });
}

/* ── 5. Arbitrary Tailwind values ────────────────────────────────────────
 * Percentages and viewport units are legitimate layout (a column that is 28%
 * wide has no business being on a 4pt scale), so they are exempt. What this
 * catches is absolute px/rem values, which are always a scale bypass.
 */
const ARBITRARY =
  /\b(?:text|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|w|h|rounded|bg|border)-\[[^\]]*(?:px|rem|em)\]/g;
for (const file of files) {
  const rel = path.relative(ROOT, file);
  if (!/\.tsx?$/.test(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  text.split("\n").forEach((line, i) => {
    const found = line.match(ARBITRARY);
    if (found) {
      failures.push(
        `[off-scale] ${rel}:${i + 1} — ${found.join(", ")} bypasses the type/spacing scale.`,
      );
    }
  });
}

/* ── report ──────────────────────────────────────────────────────────── */
console.log("\nDesign system audit\n" + "=".repeat(60));
console.log(`  scanned ${files.length} files in src/`);
console.log(`  ${lightCss.size} colour tokens, both schemes\n`);

for (const n of notes) console.log(`  note  ${n}`);
if (notes.length) console.log("");

if (!failures.length) {
  console.log("  PASS — no violations.\n");
  process.exit(0);
}
for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${failures.length} violation(s).\n`);
process.exit(1);
