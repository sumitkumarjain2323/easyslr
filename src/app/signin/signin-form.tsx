"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Maps Auth.js error codes to user-friendly messages. The Credentials
 * provider reports every failure (bad email, wrong password, parse failure)
 * as the same generic code on purpose — we don't reveal which field was wrong.
 */
function messageForError(code: string | undefined): string {
  switch (code) {
    case "CredentialsSignin":
    case "credentials":
      return "Invalid email or password.";
    case "Configuration":
      return "Authentication is misconfigured. Please contact support.";
    default:
      return "Something went wrong while signing in. Please try again.";
  }
}

export function SignInForm({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Surface a server-side auth error (?error=... redirect) as a toast once.
  const reportedError = useRef(false);
  useEffect(() => {
    if (initialError && !reportedError.current) {
      reportedError.current = true;
      toast.error(messageForError(initialError));
    }
  }, [initialError]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // Client-side guard so we don't round-trip obviously-empty submissions.
    if (!email.trim() || !password) {
      toast.error("Please enter both your email and password.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (!result || result.error) {
        toast.error(messageForError(result?.error ?? undefined));
        return;
      }

      toast.success("Signed in. Welcome back!");
      router.push("/");
      router.refresh();
    } catch {
      // Network failure, server down, etc.
      toast.error("Couldn't reach the server. Check your connection and retry.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      method="post"
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
        Email
        <input
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
          placeholder="you@example.com"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-slate-900 disabled:opacity-50"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
        Password
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
          placeholder="••••••••"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-slate-900 disabled:opacity-50"
        />
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="mt-1 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
