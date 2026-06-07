"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { api, type RouterInputs, type RouterOutputs } from "~/trpc/react";

type Article = RouterOutputs["article"]["list"][number];
type Decision = "INCLUDE" | "MAYBE" | "EXCLUDE";
type DecisionFilter = RouterInputs["article"]["list"]["decision"];
type SortBy = NonNullable<RouterInputs["article"]["list"]["sortBy"]>;

const DECISIONS: { value: Decision; label: string; active: string; idle: string }[] =
  [
    {
      value: "INCLUDE",
      label: "Include",
      active: "bg-green-600 text-white",
      idle: "text-green-700 hover:bg-green-50",
    },
    {
      value: "MAYBE",
      label: "Maybe",
      active: "bg-amber-500 text-white",
      idle: "text-amber-700 hover:bg-amber-50",
    },
    {
      value: "EXCLUDE",
      label: "Exclude",
      active: "bg-red-600 text-white",
      idle: "text-red-700 hover:bg-red-50",
    },
  ];

const FILTERS: { value: DecisionFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "UNREVIEWED", label: "Unreviewed" },
  { value: "INCLUDE", label: "Included" },
  { value: "MAYBE", label: "Maybe" },
  { value: "EXCLUDE", label: "Excluded" },
];

function badgeFor(decision: string | undefined) {
  switch (decision) {
    case "INCLUDE":
      return { label: "Include", cls: "bg-green-100 text-green-800" };
    case "EXCLUDE":
      return { label: "Exclude", cls: "bg-red-100 text-red-800" };
    case "MAYBE":
      return { label: "Maybe", cls: "bg-amber-100 text-amber-800" };
    default:
      return { label: "Unreviewed", cls: "bg-slate-100 text-slate-500" };
  }
}

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function ArticlesTable({
  projectId,
  canReview,
}: {
  projectId: string;
  canReview: boolean;
}) {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput, 300);
  const [decision, setDecision] = useState<DecisionFilter>("ALL");
  const [sortBy, setSortBy] = useState<SortBy>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const utils = api.useUtils();
  const stats = api.article.stats.useQuery({ projectId });
  const list = api.article.list.useQuery(
    { projectId, search, decision, sortBy, sortDir },
    { placeholderData: (prev) => prev },
  );

  const invalidate = () => {
    void utils.article.list.invalidate();
    void utils.article.stats.invalidate();
  };

  const setReview = api.review.set.useMutation({ onSuccess: invalidate });
  const setMany = api.review.setManyDecision.useMutation({
    onSuccess: () => {
      setSelected(new Set());
      invalidate();
    },
  });

  const articles = useMemo(() => list.data ?? [], [list.data]);
  const allSelected =
    articles.length > 0 && articles.every((a) => selected.has(a.id));

  function toggleSort(field: SortBy) {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(articles.map((a) => a.id)));
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const { csv, count, projectName } =
        await utils.article.exportCsv.fetch({ projectId });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeName = projectName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      a.href = url;
      a.download = `${safeName}-articles.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${count} article${count === 1 ? "" : "s"} to CSV.`);
    } catch {
      toast.error("Couldn't export the CSV. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <ProgressBar stats={stats.data} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search title, author, journal, DOI, PMID…"
          className="min-w-64 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setDecision(f.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                decision === f.value
                  ? "bg-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={exportCsv}
          disabled={exporting || articles.length === 0}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {/* Bulk action bar */}
      {canReview && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <span className="text-slate-400">Set decision:</span>
          {DECISIONS.map((d) => (
            <button
              key={d.value}
              disabled={setMany.isPending}
              onClick={() =>
                setMany.mutate({
                  projectId,
                  articleIds: [...selected],
                  decision: d.value,
                })
              }
              className={`rounded-md px-3 py-1 text-sm font-medium ${d.idle} disabled:opacity-50`}
            >
              {d.label}
            </button>
          ))}
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-slate-500 hover:text-slate-800"
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {canReview && (
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </th>
              )}
              <SortableTh
                label="Title"
                field="title"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <SortableTh
                label="First author"
                field="firstAuthor"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <SortableTh
                label="Year"
                field="publicationYear"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <th className="px-3 py-3">Decision</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.isError && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-red-600">
                  Failed to load articles. {list.error.message}
                </td>
              </tr>
            )}

            {!list.isError && list.isLoading && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-slate-400">
                  Loading articles…
                </td>
              </tr>
            )}

            {!list.isError && !list.isLoading && articles.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-slate-400">
                  {search || decision !== "ALL"
                    ? "No articles match your filters."
                    : "No articles yet. Import an Excel file above."}
                </td>
              </tr>
            )}

            {articles.map((article) => (
              <ArticleRow
                key={article.id}
                article={article}
                canReview={canReview}
                selected={selected.has(article.id)}
                expanded={expandedId === article.id}
                onToggleSelect={() => toggleSelect(article.id)}
                onToggleExpand={() =>
                  setExpandedId((id) => (id === article.id ? null : article.id))
                }
                onSetDecision={(d) =>
                  setReview.mutate({
                    projectId,
                    articleId: article.id,
                    decision: d,
                  })
                }
                onSaveDetails={(notes, tags) =>
                  setReview.mutate({
                    projectId,
                    articleId: article.id,
                    notes,
                    tags,
                  })
                }
                saving={setReview.isPending}
              />
            ))}
          </tbody>
        </table>
      </div>

      {list.isFetching && !list.isLoading && (
        <p className="text-xs text-slate-400">Updating…</p>
      )}
    </section>
  );
}

function ProgressBar({
  stats,
}: {
  stats: RouterOutputs["article"]["stats"] | undefined;
}) {
  if (!stats || stats.total === 0) return null;
  const segments = [
    { n: stats.included, cls: "bg-green-500", label: "Included" },
    { n: stats.maybe, cls: "bg-amber-400", label: "Maybe" },
    { n: stats.excluded, cls: "bg-red-500", label: "Excluded" },
    { n: stats.unreviewed, cls: "bg-slate-200", label: "Unreviewed" },
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
        {segments.map(
          (s) =>
            s.n > 0 && (
              <div
                key={s.label}
                className={s.cls}
                style={{ width: `${(s.n / stats.total) * 100}%` }}
              />
            ),
        )}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${s.cls}`} />
            {s.label} {s.n}
          </span>
        ))}
      </div>
    </div>
  );
}

function SortableTh({
  label,
  field,
  sortBy,
  sortDir,
  onSort,
}: {
  label: string;
  field: SortBy;
  sortBy: SortBy;
  sortDir: "asc" | "desc";
  onSort: (f: SortBy) => void;
}) {
  const active = sortBy === field;
  return (
    <th className="px-3 py-3">
      <button
        onClick={() => onSort(field)}
        className="flex items-center gap-1 font-medium uppercase tracking-wide hover:text-slate-800"
      >
        {label}
        <span className="text-slate-400">
          {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

function ArticleRow({
  article,
  canReview,
  selected,
  expanded,
  onToggleSelect,
  onToggleExpand,
  onSetDecision,
  onSaveDetails,
  saving,
}: {
  article: Article;
  canReview: boolean;
  selected: boolean;
  expanded: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onSetDecision: (d: Decision) => void;
  onSaveDetails: (notes: string, tags: string[]) => void;
  saving: boolean;
}) {
  const badge = badgeFor(article.review?.decision);
  const colSpan = canReview ? 5 : 4;

  return (
    <>
      <tr className="align-top hover:bg-slate-50">
        {canReview && (
          <td className="px-3 py-3">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              aria-label={`Select ${article.title}`}
            />
          </td>
        )}
        <td className="px-3 py-3">
          <button
            onClick={onToggleExpand}
            className="text-left font-medium text-slate-900 hover:underline"
          >
            {article.title}
          </button>
          {article.review?.tags && article.review.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {article.review.tags.map((t) => (
                <span
                  key={t}
                  className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </td>
        <td className="px-3 py-3 text-slate-600">
          {article.firstAuthor ?? "—"}
        </td>
        <td className="px-3 py-3 text-slate-600">
          {article.publicationYear ?? "—"}
        </td>
        <td className="px-3 py-3">
          {canReview ? (
            <div className="flex gap-1">
              {DECISIONS.map((d) => {
                const isActive = article.review?.decision === d.value;
                return (
                  <button
                    key={d.value}
                    disabled={saving}
                    onClick={() => onSetDecision(d.value)}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition disabled:opacity-50 ${
                      isActive ? d.active : d.idle
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}
            >
              {badge.label}
            </span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={colSpan} className="bg-slate-50 px-6 py-4">
            <ArticleDetail
              article={article}
              canReview={canReview}
              onSave={onSaveDetails}
              saving={saving}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function ArticleDetail({
  article,
  canReview,
  onSave,
  saving,
}: {
  article: Article;
  canReview: boolean;
  onSave: (notes: string, tags: string[]) => void;
  saving: boolean;
}) {
  const [notes, setNotes] = useState(article.review?.notes ?? "");
  const [tagsInput, setTagsInput] = useState(
    (article.review?.tags ?? []).join(", "),
  );

  const meta = [
    ["Authors", article.authors],
    ["Journal", article.journal],
    ["Citation", article.citation],
    ["PMID", article.pmid],
    ["DOI", article.doi],
    ["PMCID", article.pmcid],
    ["NIHMS ID", article.nihmsId],
    ["Create date", article.createDate],
  ].filter(([, v]) => Boolean(v)) as [string, string][];

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 text-sm">
        {meta.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate-400">{k}</dt>
            <dd className="break-words text-slate-700">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Reviewer notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!canReview}
            rows={3}
            placeholder={canReview ? "Add notes…" : "No notes"}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 disabled:bg-slate-100"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Tags (comma-separated)
          </label>
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            disabled={!canReview}
            placeholder={canReview ? "e.g. RCT, pediatric" : "No tags"}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 disabled:bg-slate-100"
          />
        </div>
        {canReview && (
          <button
            disabled={saving}
            onClick={() =>
              onSave(
                notes,
                tagsInput
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
              )
            }
            className="w-fit rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
          >
            Save notes &amp; tags
          </button>
        )}
      </div>
    </div>
  );
}
