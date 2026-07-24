#!/usr/bin/env node

const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const sql = readFileSync(resolve(__dirname, "../supabase/demo_seed.sql"), "utf8");
const required = [
  "\\if :{?resident_id}",
  "\\if :{?guard_id}",
  "\\if :{?admin_id}",
  "begin;",
  "commit;",
  "'11111111-1111-1111-1111-111111111111'",
  "'33333333-3333-4333-8333-000000000001'",
  "on conflict",
];
const missing = required.filter((marker) => !sql.toLowerCase().includes(marker.toLowerCase()));
if (missing.length) {
  console.error(`Demo seed is not reproducible; missing: ${missing.join(", ")}`);
  process.exit(1);
}
if (/user_[a-z0-9]{10,}/i.test(sql)) {
  console.error("Demo seed must not contain a real Clerk subject.");
  process.exit(1);
}
console.log("Demo seed has guarded identities and deterministic fixture IDs.");
