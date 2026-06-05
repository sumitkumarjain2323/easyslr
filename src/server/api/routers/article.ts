import { z } from "zod";

import {
  createTRPCRouter,
  projectProcedure,
  projectWriteProcedure,
} from "~/server/api/trpc";
import { buildRowResults, summarize } from "~/server/import/normalize";
import { parseArticleWorkbook } from "~/server/import/parse";
import type { ExistingIdentifiers } from "~/server/import/types";
import type { PrismaClient } from "../../../../generated/prisma";

const fileInput = z.object({
  // Base64-encoded .xlsx upload. Files are small (PubMed exports), so inline
  // transport keeps the flow within the typed tRPC API.
  fileBase64: z.string().min(1, "No file provided"),
});

/** Load existing PMIDs/DOIs in a project for duplicate detection. */
async function loadExistingIdentifiers(
  db: PrismaClient,
  projectId: string,
): Promise<ExistingIdentifiers> {
  const existing = await db.article.findMany({
    where: { projectId },
    select: { pmid: true, doi: true },
  });
  return {
    pmids: new Set(
      existing.map((a) => a.pmid).filter((v): v is string => Boolean(v)),
    ),
    dois: new Set(
      existing
        .map((a) => a.doi?.toLowerCase())
        .filter((v): v is string => Boolean(v)),
    ),
  };
}

export const articleRouter = createTRPCRouter({
  /** Articles in a project (access enforced by projectProcedure). */
  list: projectProcedure.query(({ ctx }) =>
    ctx.db.article.findMany({
      where: { projectId: ctx.project.id },
      orderBy: { createdAt: "desc" },
      include: { review: true },
    }),
  ),

  /**
   * Dry-run: parse + validate an uploaded file and return per-row results
   * (errors, warnings, duplicates) WITHOUT writing anything.
   */
  preview: projectProcedure
    .input(fileInput)
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");
      const raw = await parseArticleWorkbook(buffer);
      const existing = await loadExistingIdentifiers(ctx.db, ctx.project.id);
      return summarize(buildRowResults(raw, existing));
    }),

  /**
   * Commit an import: re-parse and re-validate server-side (never trusting a
   * prior preview), then persist the valid rows. Returns the same per-row
   * summary so the UI can report exactly what happened.
   */
  import: projectWriteProcedure
    .input(fileInput)
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");
      const raw = await parseArticleWorkbook(buffer);
      const existing = await loadExistingIdentifiers(ctx.db, ctx.project.id);
      const rows = buildRowResults(raw, existing);

      const toInsert = rows
        .filter((r) => r.status === "valid" && r.data)
        .map((r) => ({ ...r.data!, projectId: ctx.project.id }));

      if (toInsert.length > 0) {
        await ctx.db.article.createMany({ data: toInsert });
      }

      return summarize(rows);
    }),
});
