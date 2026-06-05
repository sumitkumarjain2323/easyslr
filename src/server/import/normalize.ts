import type {
  ExistingIdentifiers,
  ImportSummary,
  NormalizedArticle,
  RawArticleRow,
  RowResult,
} from "./types";

/** Trim a value; treat empty/whitespace-only as null. */
export function clean(value?: string | null): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normalize a DOI: trim, strip a leading "doi:" prefix (any case/spacing).
 * The stored value keeps its original case; comparisons are done lowercased.
 */
export function normalizeDoi(value?: string | null): string | null {
  const trimmed = clean(value);
  if (!trimmed) return null;
  return clean(trimmed.replace(/^doi:\s*/i, ""));
}

/** Normalize an author list: collapse spacing around ";" separators. */
export function normalizeAuthors(value?: string | null): string | null {
  const trimmed = clean(value);
  if (!trimmed) return null;
  return (
    trimmed
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .join("; ") || null
  );
}

/**
 * Parse a publication year. Returns null with a warning for non-4-digit values,
 * and a warning (but keeps the value) for out-of-range years.
 */
export function parseYear(value: string | null | undefined): {
  year: number | null;
  warning?: string;
} {
  const trimmed = clean(value);
  if (!trimmed) return { year: null };
  if (!/^\d{4}$/.test(trimmed)) {
    return {
      year: null,
      warning: `Invalid publication year "${trimmed}" — saved as empty.`,
    };
  }
  const year = Number(trimmed);
  const maxYear = new Date().getFullYear() + 1;
  if (year < 1800) {
    return { year, warning: `Publication year ${year} looks implausibly old.` };
  }
  if (year > maxYear) {
    return { year, warning: `Publication year ${year} is in the future.` };
  }
  return { year };
}

/**
 * Normalize a single raw row into a persistable article, collecting errors
 * (which block import) and warnings (which don't). A missing title is the only
 * hard error — every other field is optional in a PubMed export.
 */
export function normalizeRow(raw: RawArticleRow): {
  data: NormalizedArticle | null;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  const title = clean(raw.title);
  if (!title) errors.push("Missing title.");

  const { year, warning: yearWarning } = parseYear(raw.publicationYear);
  if (yearWarning) warnings.push(yearWarning);

  if (!title) {
    return { data: null, errors, warnings };
  }

  const data: NormalizedArticle = {
    pmid: clean(raw.pmid),
    title,
    authors: normalizeAuthors(raw.authors),
    citation: clean(raw.citation),
    firstAuthor: clean(raw.firstAuthor),
    journal: clean(raw.journal),
    publicationYear: year,
    createDate: clean(raw.createDate),
    pmcid: clean(raw.pmcid),
    nihmsId: clean(raw.nihmsId),
    doi: normalizeDoi(raw.doi),
  };

  return { data, errors, warnings };
}

const emptyExisting = (): ExistingIdentifiers => ({
  pmids: new Set(),
  dois: new Set(),
});

/**
 * Validate and classify every row. Duplicates are detected both within the file
 * and against existing project articles, by PMID first then DOI (case-insensitive).
 * Duplicate and invalid rows are reported but not imported.
 */
export function buildRowResults(
  rows: RawArticleRow[],
  existing: ExistingIdentifiers = emptyExisting(),
): RowResult[] {
  const seenPmid = new Map<string, number>();
  const seenDoi = new Map<string, number>();
  const results: RowResult[] = [];

  for (const raw of rows) {
    const { data, errors, warnings } = normalizeRow(raw);
    const base = {
      rowNumber: raw.rowNumber,
      title: clean(raw.title),
      pmid: data?.pmid ?? clean(raw.pmid),
      doi: data?.doi ?? normalizeDoi(raw.doi),
      errors,
      warnings,
    };

    if (!data) {
      results.push({ ...base, status: "error" });
      continue;
    }

    const pmidKey = data.pmid;
    const doiKey = data.doi ? data.doi.toLowerCase() : null;

    let duplicateOf: RowResult["duplicateOf"];
    if (pmidKey && seenPmid.has(pmidKey)) {
      duplicateOf = {
        source: "file",
        field: "pmid",
        value: pmidKey,
        rowNumber: seenPmid.get(pmidKey),
      };
    } else if (doiKey && seenDoi.has(doiKey)) {
      duplicateOf = {
        source: "file",
        field: "doi",
        value: data.doi!,
        rowNumber: seenDoi.get(doiKey),
      };
    } else if (pmidKey && existing.pmids.has(pmidKey)) {
      duplicateOf = { source: "existing", field: "pmid", value: pmidKey };
    } else if (doiKey && existing.dois.has(doiKey)) {
      duplicateOf = { source: "existing", field: "doi", value: data.doi! };
    }

    if (duplicateOf) {
      results.push({ ...base, status: "duplicate", duplicateOf, data });
      continue;
    }

    if (pmidKey) seenPmid.set(pmidKey, raw.rowNumber);
    if (doiKey) seenDoi.set(doiKey, raw.rowNumber);
    results.push({ ...base, status: "valid", data });
  }

  return results;
}

export function summarize(rows: RowResult[]): ImportSummary {
  return {
    total: rows.length,
    imported: rows.filter((r) => r.status === "valid").length,
    duplicates: rows.filter((r) => r.status === "duplicate").length,
    errors: rows.filter((r) => r.status === "error").length,
    rows,
  };
}
