import { validateFlatImport } from "../importValidation";

describe("validateFlatImport", () => {
  it("normalizes valid comma and whitespace rows", () => {
    expect(validateFlatImport("A,101\nB 201")).toEqual({
      rows: [
        { line: 1, tower: "A", flat: "101" },
        { line: 2, tower: "B", flat: "201" },
      ],
      issues: [],
      normalizedText: "A,101\nB,201",
    });
  });

  it("reports malformed and duplicate rows before submission", () => {
    const result = validateFlatImport("A,101\ninvalid\nA,101\nB,2,3");
    expect(result.rows).toEqual([{ line: 1, tower: "A", flat: "101" }]);
    expect(result.issues).toEqual([
      { line: 2, message: "Use Tower,Flat (for example A,101)." },
      { line: 3, message: "Duplicate entry in this import." },
      { line: 4, message: "Expected exactly one comma." },
    ]);
    expect(result.normalizedText).toBe("A,101");
  });

  it("treats duplicate tower/flat pairs case-insensitively and ignores blanks", () => {
    const result = validateFlatImport("\n North,  A-01 \n north,a-01\nSouth 202\n");
    expect(result.rows).toEqual([
      { line: 2, tower: "North", flat: "A-01" },
      { line: 4, tower: "South", flat: "202" },
    ]);
    expect(result.issues).toEqual([
      { line: 3, message: "Duplicate entry in this import." },
    ]);
  });

  it("rejects overlong values without including them in normalized output", () => {
    const result = validateFlatImport(`${"T".repeat(81)},101\nA,${"1".repeat(41)}`);
    expect(result.rows).toEqual([]);
    expect(result.issues).toEqual([
      { line: 1, message: "Tower or flat name is too long." },
      { line: 2, message: "Tower or flat name is too long." },
    ]);
    expect(result.normalizedText).toBe("");
  });

  it("enforces the same 500-row bound as the transactional RPC", () => {
    const text = Array.from({ length: 501 }, (_, index) => `Tower,${index + 1}`).join("\n");
    const result = validateFlatImport(text);
    expect(result.rows).toHaveLength(500);
    expect(result.issues).toEqual([
      { line: 501, message: "Import at most 500 rows at a time." },
    ]);
  });
});
