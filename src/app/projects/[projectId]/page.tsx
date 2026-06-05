import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { api } from "~/trpc/server";
import { ImportPanel } from "./import-panel";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const session = await auth();
  if (!session?.user) redirect("/api/auth/signin");

  let project: Awaited<ReturnType<typeof api.project.byId>>;
  try {
    project = await api.project.byId({ projectId });
  } catch {
    // Forbidden (not a member) or not found -> 404 (don't leak existence).
    notFound();
  }

  const articles = await api.article.list({ projectId });

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
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

        <ImportPanel projectId={projectId} canImport={project.role !== "VIEWER"} />

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">
            Articles{" "}
            <span className="font-normal text-slate-500">
              ({articles.length})
            </span>
          </h2>

          {articles.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-slate-500">
              No articles yet. Import an Excel file to get started.
            </p>
          ) : (
            <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {articles.map((article) => (
                <li key={article.id} className="flex flex-col gap-1 p-4">
                  <span className="font-medium">{article.title}</span>
                  <span className="text-sm text-slate-500">
                    {[
                      article.firstAuthor,
                      article.journal,
                      article.publicationYear?.toString(),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
