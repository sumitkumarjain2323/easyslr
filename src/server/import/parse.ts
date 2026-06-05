import ExcelJS from "exceljs";

import type { RawArticleRow } from "./types";

/** The string-valued fields of a row (everything except the numeric rowNumber). */
type StringField = Exclude<keyof RawArticleRow, "rowNumber">;

/** Maps lowercased header labels to row fields. Tolerates a few variants. */
const HEADER_MAP: Record<string, StringField> = {
  pmid: "pmid",
  title: "title",
  authors: "authors",
  author: "authors",
  citation: "citation",
  "first author": "firstAuthor",
  "journal/book": "journal",
  journal: "journal",
  "publication year": "publicationYear",
  year: "publicationYear",
  "create date": "createDate",
  pmcid: "pmcid",
  "nihms id": "nihmsId",
  nihmsid: "nihmsId",
  doi: "doi",
};

/** Convert an ExcelJS cell value of any shape into a plain trimmed string. */
function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") {
      return value.text.trim();
    }
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
    if ("result" in value) {
      return cellToString(value.result as ExcelJS.CellValue);
    }
  }
  return String(value).trim();
}

/**
 * Parse the first worksheet of an .xlsx buffer into raw rows, keyed by the
 * PubMed-style headers in the first row. Columns are matched by header label
 * (order-independent); unknown columns are ignored and fully blank rows skipped.
 */
export async function parseArticleWorkbook(
  buffer: Buffer,
): Promise<RawArticleRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const colToField = new Map<number, StringField>();
  worksheet.getRow(1).eachCell((cell, col) => {
    const label = cellToString(cell.value).toLowerCase();
    const field = HEADER_MAP[label];
    if (field) colToField.set(col, field);
  });

  const rows: RawArticleRow[] = [];
  for (let r = 2; r <= worksheet.rowCount; r++) {
    const sheetRow = worksheet.getRow(r);
    const raw: RawArticleRow = { rowNumber: r };
    let hasValue = false;

    for (const [col, field] of colToField) {
      const value = cellToString(sheetRow.getCell(col).value);
      if (value) {
        raw[field] = value;
        hasValue = true;
      }
    }

    if (hasValue) rows.push(raw);
  }

  return rows;
}
