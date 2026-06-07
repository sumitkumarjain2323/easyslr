import Link from "next/link";

import { auth } from "~/server/auth";
import { api } from "~/trpc/server";

export default async function Home() {
  const session = await auth();

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">
            EasySLR — Article Review Workspace
          </h1>
          <p className="text-slate-600">
            Import research articles into projects and review them with a
            table-driven workflow.
          </p>
        </header>

        {session?.user ? (
          <SignedIn name={session.user.name ?? session.user.email ?? "you"} />
        ) : (
          <SignedOut />
        )}
      </div>
    </main>
  );
}

function SignedOut() {
  return (
    <div className="flex flex-col items-start gap-4 rounded-xl border border-slate-200 bg-white p-6">
      <p className="text-slate-700">You are not signed in.</p>
      <Link
        href="/signin"
        className="rounded-lg bg-slate-900 px-5 py-2.5 font-medium text-white transition hover:bg-slate-700"
      >
        Sign in
      </Link>
    </div>
  );
}

async function SignedIn({ name }: { name: string }) {
  const organizations = await api.workspace.myOrganizations();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-slate-700">
          Signed in as <span className="font-medium">{name}</span>
        </p>
        <Link
          href="/api/auth/signout"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
        >
          Sign out
        </Link>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Your organizations</h2>

        {organizations.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-slate-500">
            You don&apos;t belong to any organizations yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {organizations.map((org) => (
              <li
                key={org.id}
                className="rounded-xl border border-slate-200 bg-white p-5"
              >
                <div className="flex items-baseline justify-between">
                  <h3 className="text-lg font-semibold">{org.name}</h3>
                  <span className="text-xs uppercase tracking-wide text-slate-400">
                    {org.memberships[0]?.role ?? "MEMBER"}
                  </span>
                </div>
                <ul className="mt-3 flex flex-col gap-2">
                  {org.projects.length === 0 ? (
                    <li className="text-sm text-slate-500">
                      No projects you can access.
                    </li>
                  ) : (
                    org.projects.map((project) => (
                      <li key={project.id}>
                        <Link
                          href={`/projects/${project.id}`}
                          className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2 transition hover:bg-slate-100"
                        >
                          <span className="font-medium">{project.name}</span>
                          <span className="text-sm text-slate-500">
                            {project._count.articles} articles
                          </span>
                        </Link>
                      </li>
                    ))
                  )}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
