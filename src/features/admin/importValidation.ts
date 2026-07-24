import { flatImportRowSchema, formatValidationError } from "@/lib/validation";
import { z } from "zod";

export type FlatImportRow = z.infer<typeof flatImportRowSchema>;

export interface FlatImportIssue {
  line: number;
  message: string;
}

export const MAX_FLAT_IMPORT_ROWS = 500;

export function validateFlatImport(text: string) {
  const rows: FlatImportRow[] = [];
  const issues: FlatImportIssue[] = [];
  const seen = new Set<string>();

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const value = raw.trim();
    if (!value) return;

    const parts = value.includes(",")
      ? value.split(",").map((part) => part.trim())
      : value.split(/\s+/);
    const tower = parts[0] ?? "";
    const flat = parts.slice(1).join(" ").trim();
    if (parts.length < 2 || !tower || !flat) {
      issues.push({ line, message: "Use Tower,Flat (for example A,101)." });
      return;
    }
    if (value.includes(",") && parts.length !== 2) {
      issues.push({ line, message: "Expected exactly one comma." });
      return;
    }
    if (tower.length > 80 || flat.length > 40) {
      issues.push({ line, message: "Tower or flat name is too long." });
      return;
    }
    if (rows.length >= MAX_FLAT_IMPORT_ROWS) {
      issues.push({ line, message: `Import at most ${MAX_FLAT_IMPORT_ROWS} rows at a time.` });
      return;
    }

    const key = `${tower.toLocaleLowerCase()}\u0000${flat.toLocaleLowerCase()}`;
    if (seen.has(key)) {
      issues.push({ line, message: "Duplicate entry in this import." });
      return;
    }
    seen.add(key);
    const parsed = flatImportRowSchema.safeParse({ line, tower, flat });
    if (!parsed.success) {
      issues.push({ line, message: formatValidationError(parsed.error) });
      return;
    }
    rows.push(parsed.data);
  });

  return {
    rows,
    issues,
    normalizedText: rows.map(({ tower, flat }) => `${tower},${flat}`).join("\n"),
  };
}
