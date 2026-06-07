import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { api } from "~/trpc/server";
import { ArticlesTable } from "./articles-table";
import { ImportPanel } from "./import-panel";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const session = await auth();
  if (!session?.user) redirect("/signin");

  let project: Awaited<ReturnType<typeof api.project.byId>>;
  try {
    project = await api.project.byId({ projectId });
  } catch {
    // Forbidden (not a member) or not found -> 404 (don't leak existence).
    notFound();
  }

  const canReview = project.role !== "VIEWER";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
        <div className="flex flex-col gap-1">
          <Link
            href="/"
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            ← All projects
          </Link>
          <div className="flex items-baseline justify-between">
            <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
            <span className="text-xs uppercase tracking-wide text-slate-400">
              {project.role}
            </span>
          </div>
          {project.description && (
            <p className="text-slate-600">{project.description}</p>
          )}
        </div>

        <ImportPanel projectId={projectId} canImport={canReview} />

        <ArticlesTable projectId={projectId} canReview={canReview} />
      </div>
    </main>
  );
}
