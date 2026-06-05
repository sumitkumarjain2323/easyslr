import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  createTRPCRouter,
  projectProcedure,
  protectedProcedure,
} from "~/server/api/trpc";

export const projectRouter = createTRPCRouter({
  /** Projects the signed-in user can access, across all their organizations. */
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.project.findMany({
      where: { memberships: { some: { userId: ctx.session.user.id } } },
      orderBy: { name: "asc" },
      include: {
        organization: { select: { id: true, name: true } },
        _count: { select: { articles: true } },
      },
    }),
  ),

  /** A single project. Access is enforced by `projectProcedure`. */
  byId: projectProcedure.query(({ ctx }) => ({
    ...ctx.project,
    role: ctx.membership.role,
  })),

  /**
   * Create a project inside an organization. Requires the user to be an
   * OWNER or ADMIN of that organization (org-level authorization). The creator
   * is added as the project OWNER.
   */
  create: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().min(1),
        name: z.string().min(1, "Name is required"),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgMembership = await ctx.db.orgMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: ctx.session.user.id,
            organizationId: input.organizationId,
          },
        },
      });

      if (
        !orgMembership ||
        (orgMembership.role !== "OWNER" && orgMembership.role !== "ADMIN")
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot create projects in this organization.",
        });
      }

      return ctx.db.project.create({
        data: {
          name: input.name,
          description: input.description,
          organizationId: input.organizationId,
          memberships: {
            create: { userId: ctx.session.user.id, role: "OWNER" },
          },
        },
      });
    }),
});
