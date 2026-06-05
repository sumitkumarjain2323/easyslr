import { describe, expect, it } from "vitest";

import {
  buildRowResults,
  normalizeAuthors,
  normalizeDoi,
  normalizeRow,
  parseYear,
  summarize,
} from "./normalize";
import type { ExistingIdentifiers, RawArticleRow } from "./types";

describe("normalizeDoi", () => {
  it("strips a doi: prefix (any case) and trims", () => {
    expect(normalizeDoi(" DOI:10.1000/NQ.2024.010 ")).toBe("10.1000/NQ.2024.010");
    expect(normalizeDoi("doi: 10.1/x")).toBe("10.1/x");
  });
  it("preserves original case (comparison is done lowercased elsewhere)", () => {
    expect(normalizeDoi("10.1000/ABC")).toBe("10.1000/ABC");
  });
  it("returns null for empty/whitespace", () => {
    expect(normalizeDoi("   ")).toBeNull();
    expect(normalizeDoi(undefined)).toBeNull();
  });
});

describe("normalizeAuthors", () => {
  it("collapses spacing around semicolons", () => {
    expect(normalizeAuthors("  Patel A ; Green D ")).toBe("Patel A; Green D");
  });
  it("returns null when empty", () => {
    expect(normalizeAuthors("")).toBeNull();
  });
});

describe("parseYear", () => {
  it("parses a valid 4-digit year with no warning", () => {
    expect(parseYear("2024")).toEqual({ year: 2024 });
  });
  it("rejects non-numeric years -> null with warning", () => {
    const r = parseYear("Twenty twenty");
    expect(r.year).toBeNull();
    expect(r.warning).toMatch(/invalid publication year/i);
  });
  it("keeps a future year but warns", () => {
    const r = parseYear("9999");
    expect(r.year).toBe(9999);
    expect(r.warning).toMatch(/future/i);
  });
  it("treats empty as null with no warning", () => {
    expect(parseYear("")).toEqual({ year: null });
  });
});

describe("normalizeRow", () => {
  it("errors when the title is missing", () => {
    const { data, errors } = normalizeRow({ rowNumber: 2, pmid: "1" });
    expect(data).toBeNull();
    expect(errors).toContain("Missing title.");
  });
  it("normalizes a complete row", () => {
    const { data, errors, warnings } = normalizeRow({
      rowNumber: 2,
      pmid: " 123 ",
      title: " A Study ",
      authors: " Smith J ; Lee K ",
      doi: "DOI:10.1/AbC",
      publicationYear: "2021",
    });
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
    expect(data).toMatchObject({
      pmid: "123",
      title: "A Study",
      authors: "Smith J; Lee K",
      doi: "10.1/AbC",
      publicationYear: 2021,
    });
  });
});

const noExisting: ExistingIdentifiers = { pmids: new Set(), dois: new Set() };

describe("buildRowResults — duplicate detection", () => {
  it("flags an in-file duplicate by PMID", () => {
    const rows: RawArticleRow[] = [
      { rowNumber: 2, pmid: "100", title: "First" },
      { rowNumber: 3, pmid: "100", title: "Second", doi: "10.1/unique" },
    ];
    const results = buildRowResults(rows, noExisting);
    expect(results[0]!.status).toBe("valid");
    expect(results[1]!.status).toBe("duplicate");
    expect(results[1]!.duplicateOf).toMatchObject({
      source: "file",
      field: "pmid",
      rowNumber: 2,
    });
  });

  it("flags an in-file duplicate by DOI, case-insensitively", () => {
    const rows: RawArticleRow[] = [
      { rowNumber: 2, title: "First", doi: "10.1/AbC" },
      { rowNumber: 3, title: "Second", doi: "doi:10.1/abc" },
    ];
    const results = buildRowResults(rows, noExisting);
    expect(results[1]!.status).toBe("duplicate");
    expect(results[1]!.duplicateOf?.field).toBe("doi");
  });

  it("flags a duplicate against an existing project article", () => {
    const existing: ExistingIdentifiers = {
      pmids: new Set(["999"]),
      dois: new Set(),
    };
    const results = buildRowResults(
      [{ rowNumber: 2, pmid: "999", title: "Dup" }],
      existing,
    );
    expect(results[0]!.status).toBe("duplicate");
    expect(results[0]!.duplicateOf?.source).toBe("existing");
  });

  it("does not treat blank identifiers as duplicates", () => {
    const rows: RawArticleRow[] = [
      { rowNumber: 2, title: "No ids A" },
      { rowNumber: 3, title: "No ids B" },
    ];
    const results = buildRowResults(rows, noExisting);
    expect(results.every((r) => r.status === "valid")).toBe(true);
  });
});

describe("buildRowResults — representative sample import", () => {
  it("classifies a mix of valid / duplicate / error rows", () => {
    const rows: RawArticleRow[] = [
      { rowNumber: 2, pmid: "1", title: "Valid one", doi: "10.1/a" },
      { rowNumber: 3, pmid: "2", title: "Missing-title removed?" }, // valid
      { rowNumber: 4, pmid: "3", title: "", doi: "10.1/b" }, // error: no title
      { rowNumber: 5, pmid: "4", title: "Dup doi", doi: "10.1/a" }, // duplicate of row 2
      { rowNumber: 6, pmid: "1", title: "Dup pmid" }, // duplicate of row 2 (pmid)
      { rowNumber: 7, pmid: "5", title: "Bad year", publicationYear: "nope" }, // valid + warning
    ];
    const summary = summarize(buildRowResults(rows, noExisting));
    expect(summary.total).toBe(6);
    expect(summary.imported).toBe(3);
    expect(summary.duplicates).toBe(2);
    expect(summary.errors).toBe(1);

    const badYear = summary.rows.find((r) => r.rowNumber === 7)!;
    expect(badYear.status).toBe("valid");
    expect(badYear.warnings.length).toBeGreaterThan(0);
  });
});
