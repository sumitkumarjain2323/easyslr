/** Raw, untrusted values read from one spreadsheet row (strings as-parsed). */
export interface RawArticleRow {
  /** 1-based worksheet row number (including the header), for user feedback. */
  rowNumber: number;
  pmid?: string;
  title?: string;
  authors?: string;
  citation?: string;
  firstAuthor?: string;
  journal?: string;
  publicationYear?: string;
  createDate?: string;
  pmcid?: string;
  nihmsId?: string;
  doi?: string;
}

/** A normalized, persistable article (maps 1:1 to Article scalar fields). */
export interface NormalizedArticle {
  pmid: string | null;
  title: string;
  authors: string | null;
  citation: string | null;
  firstAuthor: string | null;
  journal: string | null;
  publicationYear: number | null;
  createDate: string | null;
  pmcid: string | null;
  nihmsId: string | null;
  doi: string | null;
}

export type RowStatus = "valid" | "error" | "duplicate";

export interface DuplicateInfo {
  /** Whether the match is another row in this file or an existing DB article. */
  source: "file" | "existing";
  field: "pmid" | "doi";
  value: string;
  /** For in-file duplicates, the row number it collides with. */
  rowNumber?: number;
}

/** Per-row outcome of validation. */
export interface RowResult {
  rowNumber: number;
  status: RowStatus;
  title: string | null;
  pmid: string | null;
  doi: string | null;
  errors: string[];
  warnings: string[];
  duplicateOf?: DuplicateInfo;
  /** Present when the row is importable (status "valid") or a skipped duplicate. */
  data?: NormalizedArticle;
}

export interface ImportSummary {
  total: number;
  imported: number;
  duplicates: number;
  errors: number;
  rows: RowResult[];
}

/** Existing identifiers in a project, used for duplicate detection. */
export interface ExistingIdentifiers {
  pmids: Set<string>;
  /** DOIs stored lowercased for case-insensitive comparison. */
  dois: Set<string>;
}
