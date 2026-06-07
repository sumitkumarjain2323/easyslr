import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { SignInForm } from "./signin-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Already authenticated -> no reason to show the form.
  const session = await auth();
  if (session?.user) redirect("/");

  // Auth.js may redirect here with ?error=... on a server-side auth failure.
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-900">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col gap-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight">EasySLR</h1>
          <p className="text-sm text-slate-500">
            Sign in to your article review workspace.
          </p>
        </div>
        <SignInForm initialError={error} />
      </div>
    </main>
  );
}
