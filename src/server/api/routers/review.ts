import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, projectWriteProcedure } from "~/server/api/trpc";
import { ReviewDecision } from "../../../../generated/prisma";

export const reviewRouter = createTRPCRouter({
  /**
   * Create or update the review for one article: decision, notes, and/or tags.
   * Only the provided fields are changed. Records who last reviewed it.
   */
  set: projectWriteProcedure
    .input(
      z.object({
        articleId: z.string().min(1),
        decision: z.nativeEnum(ReviewDecision).optional(),
        notes: z.string().max(5000).optional(),
        tags: z.array(z.string().trim().min(1)).max(50).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // The guard checks project access; we still must confirm the article
      // belongs to this project (article ids are not otherwise constrained).
      const article = await ctx.db.article.findFirst({
        where: { id: input.articleId, projectId: ctx.project.id },
        select: { id: true },
      });
      if (!article) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Article not found in this project.",
        });
      }

      const userId = ctx.session.user.id;
      return ctx.db.review.upsert({
        where: { articleId: input.articleId },
        create: {
          articleId: input.articleId,
          reviewedById: userId,
          decision: input.decision ?? "UNREVIEWED",
          notes: input.notes,
          tags: input.tags ?? [],
        },
        update: {
          reviewedById: userId,
          ...(input.decision !== undefined ? { decision: input.decision } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.tags !== undefined ? { tags: input.tags } : {}),
        },
      });
    }),

  /** Bulk action: apply one decision to many selected articles. */
  setManyDecision: projectWriteProcedure
    .input(
      z.object({
        articleIds: z.array(z.string().min(1)).min(1).max(500),
        decision: z.nativeEnum(ReviewDecision),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const inProject = await ctx.db.article.count({
        where: { id: { in: input.articleIds }, projectId: ctx.project.id },
      });
      if (inProject !== input.articleIds.length) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Some articles are not in this project.",
        });
      }

      const userId = ctx.session.user.id;
      await ctx.db.$transaction(
        input.articleIds.map((articleId) =>
          ctx.db.review.upsert({
            where: { articleId },
            create: {
              articleId,
              reviewedById: userId,
              decision: input.decision,
              tags: [],
            },
            update: { decision: input.decision, reviewedById: userId },
          }),
        ),
      );

      return { updated: input.articleIds.length };
    }),
});
