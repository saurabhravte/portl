#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const { readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

const target = resolve(__dirname, "../src/lib/database.types.ts");
const cli = process.platform === "win32" ? "supabase.exe" : "supabase";
let result = spawnSync(cli, ["gen", "types", "typescript", "--local"], {
  encoding: "utf8",
});
if (result.error?.code === "ENOENT") {
  result = spawnSync(
    process.platform === "win32" ? "bun.exe" : "bun",
    ["x", "supabase", "gen", "types", "typescript", "--local"],
    { encoding: "utf8" },
  );
}
if (result.status !== 0) {
  process.stderr.write(result.stderr || "Supabase type generation failed.\n");
  process.exit(result.status || 1);
}

const normalize = (value) => value.replace(/\r\n/g, "\n").trimEnd() + "\n";
const generated = normalize(result.stdout);
if (process.argv.includes("--write")) {
  writeFileSync(target, generated);
  console.log("Updated src/lib/database.types.ts.");
  process.exit(0);
}

const committed = normalize(readFileSync(target, "utf8"));
if (committed !== generated) {
  console.error(
    "Generated database types have drifted. Run `bun run gen:types` after a local Supabase reset.",
  );
  process.exit(1);
}
console.log("Generated database types match the local schema.");
