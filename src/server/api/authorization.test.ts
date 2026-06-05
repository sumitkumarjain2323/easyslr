import { describe, expect, it, vi } from "vitest";

// The tRPC context imports `auth` from next-auth, which can't load `next/server`
// under Vitest. These tests inject session + db directly, so the real auth()
// is never used — stub the module to avoid loading next-auth at import time.
vi.mock("~/server/auth", () => ({
  auth: vi.fn(),
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

import { createCaller } from "~/server/api/root";
import type { PrismaClient } from "../../../generated/prisma";

/**
 * These tests exercise the server-side authorization guard and review-state
 * mutations through the real tRPC router, using a mocked Prisma client. They
 * assert behavior that matters: project access is enforced in the API (not the
 * UI), role gates work, and review updates record the reviewer.
 */

const headers = new Headers();
const session = (id = "user-1") => ({ user: { id }, expires: "2999-01-01" });

function caller(db: unknown, s: ReturnType<typeof session> | null = session()) {
  return createCaller({
    db: db as PrismaClient,
    session: s,
    headers,
  });
}

describe("project access authorization", () => {
  it("rejects an unauthenticated caller with UNAUTHORIZED", async () => {
    const c = caller({}, null);
    await expect(c.article.list({ projectId: "p1" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects a non-member with FORBIDDEN", async () => {
    const db = {
      projectMembership: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    await expect(
      caller(db).article.list({ projectId: "p1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows a member to read articles", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = {
      projectMembership: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ role: "VIEWER", project: { id: "p1" } }),
      },
      article: { findMany },
    };
    await expect(caller(db).article.list({ projectId: "p1" })).resolves.toEqual(
      [],
    );
    // Handler scopes the query to the guarded project.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ projectId: "p1" }),
      }),
    );
  });

  it("forbids a VIEWER from writing a review (role gate)", async () => {
    const db = {
      projectMembership: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ role: "VIEWER", project: { id: "p1" } }),
      },
    };
    await expect(
      caller(db).review.set({
        projectId: "p1",
        articleId: "a1",
        decision: "INCLUDE",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("review state updates", () => {
  const ownerMembership = {
    projectMembership: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ role: "OWNER", project: { id: "p1" } }),
    },
  };

  it("rejects setting a review on an article outside the project", async () => {
    const db = {
      ...ownerMembership,
      article: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    await expect(
      caller(db).review.set({
        projectId: "p1",
        articleId: "ghost",
        decision: "INCLUDE",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("upserts a review and records the reviewer", async () => {
    const upsert = vi.fn().mockResolvedValue({
      id: "r1",
      decision: "INCLUDE",
      notes: "Strong RCT",
      tags: ["RCT"],
    });
    const db = {
      ...ownerMembership,
      article: { findFirst: vi.fn().mockResolvedValue({ id: "a1" }) },
      review: { upsert },
    };

    const result = await caller(db).review.set({
      projectId: "p1",
      articleId: "a1",
      decision: "INCLUDE",
      notes: "Strong RCT",
      tags: ["RCT"],
    });

    expect(result.decision).toBe("INCLUDE");
    expect(upsert).toHaveBeenCalledOnce();
    const arg = upsert.mock.calls[0]![0] as {
      where: unknown;
      create: { reviewedById: string };
      update: { reviewedById: string; decision: string };
    };
    expect(arg.where).toEqual({ articleId: "a1" });
    expect(arg.create.reviewedById).toBe("user-1");
    expect(arg.update.reviewedById).toBe("user-1");
    expect(arg.update.decision).toBe("INCLUDE");
  });
});
