"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { api, type RouterOutputs } from "~/trpc/react";

type ImportSummary = RouterOutputs["article"]["preview"];

/** Read a File into a base64 string (without the data: URL prefix). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const STATUS_STYLES: Record<string, string> = {
  valid: "bg-green-100 text-green-800",
  duplicate: "bg-amber-100 text-amber-800",
  error: "bg-red-100 text-red-800",
};

export function ImportPanel({
  projectId,
  canImport,
}: {
  projectId: string;
  canImport: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [committed, setCommitted] = useState(false);

  const preview = api.article.preview.useMutation({
    onSuccess: (data) => {
      setSummary(data);
      setCommitted(false);
    },
  });
  const commit = api.article.import.useMutation({
    onSuccess: (data) => {
      setSummary(data);
      setCommitted(true);
      router.refresh();
    },
  });

  const busy = preview.isPending || commit.isPending;
  const error = preview.error ?? commit.error;

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setSummary(null);
    setCommitted(false);
    if (!file) {
      setFileBase64(null);
      setFileName(null);
      return;
    }
    const base64 = await fileToBase64(file);
    setFileBase64(base64);
    setFileName(file.name);
    preview.mutate({ projectId, fileBase64: base64 });
  }

  function reset() {
    setFileBase64(null);
    setFileName(null);
    setSummary(null);
    setCommitted(false);
    preview.reset();
    commit.reset();
    if (inputRef.current) inputRef.current.value = "";
  }

  if (!canImport) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
        You have viewer access, which does not permit importing articles.
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Import articles</h2>
        {fileName && (
          <button
            onClick={reset}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            Clear
          </button>
        )}
      </div>

      <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={onFileChange}
          disabled={busy}
        />
        {fileName ?? "Choose .xlsx file"}
      </label>

      {busy && <p className="text-sm text-slate-500">Working…</p>}

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error.message}
        </p>
      )}

      {summary && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3 text-sm">
            <Stat label="Rows" value={summary.total} />
            <Stat
              label={committed ? "Imported" : "Will import"}
              value={summary.imported}
              tone="green"
            />
            <Stat label="Duplicates" value={summary.duplicates} tone="amber" />
            <Stat label="Errors" value={summary.errors} tone="red" />
          </div>

          {committed ? (
            <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
              Imported {summary.imported} article
              {summary.imported === 1 ? "" : "s"}. Duplicates and invalid rows
              were skipped.
            </p>
          ) : (
            <button
              onClick={() =>
                fileBase64 && commit.mutate({ projectId, fileBase64 })
              }
              disabled={busy || summary.imported === 0}
              className="w-fit rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-40"
            >
              Import {summary.imported} valid row
              {summary.imported === 1 ? "" : "s"}
            </button>
          )}

          <PreviewTable rows={summary.rows} />
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "green" | "amber" | "red";
}) {
  const toneClass =
    tone === "green"
      ? "text-green-700"
      : tone === "amber"
        ? "text-amber-700"
        : tone === "red"
          ? "text-red-700"
          : "text-slate-700";
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <span className={`text-base font-semibold ${toneClass}`}>{value}</span>{" "}
      <span className="text-slate-500">{label}</span>
    </div>
  );
}

function PreviewTable({ rows }: { rows: ImportSummary["rows"] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Row</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Title</th>
            <th className="px-3 py-2">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.rowNumber} className="align-top">
              <td className="px-3 py-2 text-slate-500">{row.rowNumber}</td>
              <td className="px-3 py-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    STATUS_STYLES[row.status]
                  }`}
                >
                  {row.status}
                </span>
              </td>
              <td className="px-3 py-2">
                {row.title ?? <span className="text-slate-400">—</span>}
              </td>
              <td className="px-3 py-2 text-slate-600">
                {row.duplicateOf && (
                  <div>
                    Duplicate {row.duplicateOf.field.toUpperCase()} (
                    {row.duplicateOf.source === "file"
                      ? `row ${row.duplicateOf.rowNumber}`
                      : "already imported"}
                    )
                  </div>
                )}
                {row.errors.map((e) => (
                  <div key={e} className="text-red-600">
                    {e}
                  </div>
                ))}
                {row.warnings.map((w) => (
                  <div key={w} className="text-amber-600">
                    {w}
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
