import { z } from "zod";

import {
  createTRPCRouter,
  projectProcedure,
  projectWriteProcedure,
} from "~/server/api/trpc";
import { buildRowResults, summarize } from "~/server/import/normalize";
import { parseArticleWorkbook } from "~/server/import/parse";
import type { ExistingIdentifiers } from "~/server/import/types";
import type { Prisma, PrismaClient } from "../../../../generated/prisma";

const fileInput = z.object({
  // Base64-encoded .xlsx upload. Files are small (PubMed exports), so inline
  // transport keeps the flow within the typed tRPC API.
  fileBase64: z.string().min(1, "No file provided"),
});

const listInput = z.object({
  search: z.string().trim().optional(),
  decision: z
    .enum(["ALL", "UNREVIEWED", "INCLUDE", "EXCLUDE", "MAYBE"])
    .default("ALL"),
  sortBy: z
    .enum(["title", "publicationYear", "firstAuthor", "createdAt"])
    .default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
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
  /**
   * Articles in a project with server-side search, decision filter and sort.
   * Access is enforced by projectProcedure.
   */
  list: projectProcedure.input(listInput).query(({ ctx, input }) => {
    const and: Prisma.ArticleWhereInput[] = [];

    if (input.search) {
      const s = input.search;
      and.push({
        OR: [
          { title: { contains: s, mode: "insensitive" } },
          { authors: { contains: s, mode: "insensitive" } },
          { firstAuthor: { contains: s, mode: "insensitive" } },
          { journal: { contains: s, mode: "insensitive" } },
          { doi: { contains: s, mode: "insensitive" } },
          { pmid: { contains: s, mode: "insensitive" } },
        ],
      });
    }

    if (input.decision === "UNREVIEWED") {
      // No review row yet, or an explicit UNREVIEWED decision.
      and.push({
        OR: [{ review: { is: null } }, { review: { is: { decision: "UNREVIEWED" } } }],
      });
    } else if (input.decision !== "ALL") {
      and.push({ review: { is: { decision: input.decision } } });
    }

    return ctx.db.article.findMany({
      where: { projectId: ctx.project.id, ...(and.length ? { AND: and } : {}) },
      orderBy: { [input.sortBy]: input.sortDir },
      include: { review: true },
    });
  }),

  /** Decision counts for the whole project (used for the progress bar). */
  stats: projectProcedure.query(async ({ ctx }) => {
    const projectId = ctx.project.id;
    const [total, grouped] = await Promise.all([
      ctx.db.article.count({ where: { projectId } }),
      ctx.db.review.groupBy({
        by: ["decision"],
        where: { article: { projectId } },
        _count: { _all: true },
      }),
    ]);

    const counts: Record<string, number> = {};
    for (const g of grouped) counts[g.decision] = g._count._all;

    const included = counts.INCLUDE ?? 0;
    const excluded = counts.EXCLUDE ?? 0;
    const maybe = counts.MAYBE ?? 0;

    return {
      total,
      included,
      excluded,
      maybe,
      unreviewed: total - included - excluded - maybe,
    };
  }),

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
