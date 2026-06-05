import { projectProcedure } from "~/server/api/trpc";
import { createTRPCRouter } from "~/server/api/trpc";

/**
 * Article reads are scoped to a project via `projectProcedure`, so a user can
 * only ever see articles in a project they belong to (server-side enforcement).
 *
 * Import (Phase 3), and richer table queries + review mutations (Phase 4), are
 * added on top of this guard.
 */
export const articleRouter = createTRPCRouter({
  list: projectProcedure.query(({ ctx }) =>
    ctx.db.article.findMany({
      where: { projectId: ctx.project.id },
      orderBy: { createdAt: "desc" },
      include: { review: true },
    }),
  ),
});
