import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

/**
 * Read-only workspace router used to verify the domain model + auth wiring.
 * Returns the organizations the signed-in user belongs to, along with the
 * projects within them that the user has project-level access to.
 *
 * NOTE: This filters by membership inline. A reusable project-access guard
 * (middleware) is introduced in Phase 2 (Authorization).
 */
export const workspaceRouter = createTRPCRouter({
  myOrganizations: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    return ctx.db.organization.findMany({
      where: { memberships: { some: { userId } } },
      orderBy: { name: "asc" },
      include: {
        memberships: {
          where: { userId },
          select: { role: true },
        },
        projects: {
          where: { memberships: { some: { userId } } },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            description: true,
            _count: { select: { articles: true } },
          },
        },
      },
    });
  }),
});
