# EasySLR — Article Review Workspace

A self-contained slice of a systematic-literature-review (SLR) tool: users work
inside **organizations** and **projects**, **import** research articles from a
PubMed-style Excel export, and **review** them with a table-driven workflow
(Include / Maybe / Exclude, notes, tags) with search, filtering, sorting, and
bulk actions.

> Built for the EasySLR engineering assignment.

- **Repository:** https://github.com/sumitkumarjain2323/easyslr
- **Deployed URL:** https://easyslr.vercel.app (sign in at `/signin`)
- **Demo credentials:** `demo@easyslr.dev` / `demo1234` (more below)

---

## Tech stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| API | tRPC v11 (typed end-to-end) |
| ORM / DB | Prisma 6 + PostgreSQL |
| Auth | NextAuth / Auth.js v5 (Credentials, JWT sessions, bcrypt) |
| Excel parsing | ExcelJS |
| Tests | Vitest |

Bootstrapped with `create-t3-app`.

---

## Setup (local)

### Prerequisites
- Node.js 20+ and npm
- A running PostgreSQL 14+ instance

### 1. Install
```bash
npm install
```

### 2. Create the database
Create a database and a dedicated role (example values match `.env.example`):
```sql
CREATE ROLE easyslr WITH LOGIN PASSWORD 'easyslr_dev';
CREATE DATABASE easyslr OWNER easyslr;
-- Prisma's migrate dev needs a shadow database:
ALTER ROLE easyslr CREATEDB;
```

### 3. Configure environment
```bash
cp .env.example .env
```
Set the values in `.env`:
```bash
DATABASE_URL="postgresql://easyslr:easyslr_dev@localhost:5432/easyslr"
AUTH_SECRET="<run: npx auth secret>"
```

### 4. Migrate and seed
```bash
npx prisma migrate dev   # applies migrations
npm run db:seed          # demo users, orgs, and a project
```

### 5. Run
```bash
npm run dev              # http://localhost:3000
```

### Demo logins (all password `demo1234`)
| Email | Access |
| --- | --- |
| `demo@easyslr.dev` | Acme Research — project **owner** |
| `reviewer@easyslr.dev` | Acme Research — **reviewer** |
| `outsider@easyslr.dev` | Beta Labs only — **no** access to Acme (for testing authorization) |

A sample import file (`sample_article_import.xlsx`) is provided at the repo root
of the assignment; sign in as `demo@easyslr.dev`, open the project, and use
**Import articles**.

### Useful scripts
```bash
npm test            # run the test suite
npm run typecheck   # tsc --noEmit
npm run build       # production build
npm run db:studio   # Prisma Studio
```

---

## Architecture

```
Organization ──< Project ──< Article ──1 Review
     │              │
     └─< OrgMembership   └─< ProjectMembership   (both carry roles)
                              ▲
                            User
```

- **Domain model** ([prisma/schema.prisma](prisma/schema.prisma)) — organizations
  contain projects; projects contain articles; users join orgs and projects
  through explicit membership tables that carry roles (`OrgRole`,
  `ProjectRole`). One `Review` per article holds the decision, notes, and tags.

- **Authorization** ([src/server/api/trpc.ts](src/server/api/trpc.ts)) — a
  reusable `projectProcedure` is the single server-side gate for everything
  inside a project. It requires a `projectId`, verifies the caller's
  `ProjectMembership`, and injects the membership + project into context.
  `projectWriteProcedure` adds a role check (OWNER/REVIEWER; VIEWER is
  read-only). **Access is enforced in the API, not the UI** — handlers trust the
  guard and never re-check.

- **Import pipeline** ([src/server/import/](src/server/import/)) — split into a
  thin Excel parser (`parse.ts`, ExcelJS) and a **pure, dependency-free
  validation core** (`normalize.ts`). The router exposes `article.preview`
  (dry-run, no writes) and `article.import` (re-validates server-side, then
  persists). Keeping validation pure makes it fully unit-testable without a DB
  or Excel.

- **Review workspace** ([src/app/projects/[projectId]/](src/app/projects/%5BprojectId%5D/)) —
  a client table backed by `article.list` (server-side search/filter/sort) and
  `article.stats`, with per-row decisions, bulk actions, and an expandable
  notes/tags editor.

---

## Review workflow (design rationale)

Screening is the core of an SLR, so the workflow is decision-first rather than a
generic CRUD grid:

- **Include / Maybe / Exclude** decisions, settable per-row (one click) or in
  **bulk** for a selection.
- **Reviewer notes** and freeform **tags** per article (e.g. `RCT`, `pediatric`).
- A **progress bar** showing how much of the project has been triaged.
- **Filter by decision** (including "Unreviewed") plus full-text search and
  column sorting, so a reviewer can work through the backlog efficiently.
- **CSV export** of the project's articles with their review state (decision,
  notes, tags), for handing screening results to downstream tools.

One review per article (the project's current decision) keeps the model simple
and explainable; multi-reviewer adjudication is listed under
[future work](#what-id-improve-next).

---

## Import validation choices

The sample file is intentionally messy; here is how each case is handled
(reported per-row in the preview before anything is written):

| Case | Handling |
| --- | --- |
| **Missing title** | **Error** — row is skipped (title is the only required field) |
| **Invalid year** (e.g. "Twenty twenty") | Warning — year saved as empty, row still imported |
| **Future / implausible year** (e.g. 2035) | Warning — value kept, row still imported |
| **Duplicate PMID or DOI within the file** | Skipped as duplicate (first occurrence wins) |
| **Duplicate of an already-imported article** | Skipped as duplicate |
| **Whitespace / casing / `DOI:` prefix** | Normalized (trimmed; DOI prefix stripped; author spacing collapsed) |
| **Blank PMID/DOI** | Allowed — blanks are never treated as duplicates |
| **Optional fields blank** (PMCID, NIHMS ID, authors…) | Allowed |

Duplicate detection compares **PMID first, then DOI** (case-insensitive),
both within the uploaded file and against existing articles in the project. The
import is **idempotent** — re-uploading the same file adds nothing.

---

## Tests

```bash
npm test   # 22 tests
```
Focused on behavior that matters (not UI snapshots):

- **Import validation** ([normalize.test.ts](src/server/import/normalize.test.ts)) —
  normalization (DOI/author/year), missing-title errors, and duplicate detection
  (in-file by PMID/DOI case-insensitive, and against existing articles).
- **Authorization & review state** ([authorization.test.ts](src/server/api/authorization.test.ts)) —
  run through the real tRPC router with a mocked Prisma client: UNAUTHORIZED /
  FORBIDDEN gates, VIEWER write denial, the article-in-project check, and that a
  review upsert records the reviewer.

---

## Deployment

**Live at https://easyslr.vercel.app** — deployed on **Vercel** (Next.js host)
with a **Neon** serverless PostgreSQL database. Demo credentials are listed
above; sign in at `/signin`.

How the deployment is handled:

- **Secrets** — `DATABASE_URL` and `AUTH_SECRET` are set as Vercel environment
  variables (Production + Preview), never committed (`.env` is gitignored; only
  `.env.example` ships).
- **Migrations** — `prisma migrate deploy` is run against the Neon database
  (with the direct, non-pooled connection); the app runtime uses Neon's
  **pooled** connection string, which serverless functions require.
- **Failure modes** — the import flow fails safe (validate-then-write, per-row
  error reporting, idempotent re-runs); the UI surfaces auth/query failures via
  toasts and explicit loading/empty/error states. Neon's free tier scales to
  zero, so the first request after idle wakes the DB (a brief one-time delay).
- **Logs** — Vercel function logs + Neon dashboard.
- **Cost** — effectively $0: Vercel Hobby + Neon free tier.

Vercel was chosen over AWS for the fastest zero-config path for this Next.js
stack within the timebox. **If deploying to AWS (SST preferred)** instead:

- **Secrets** — `DATABASE_URL` and `AUTH_SECRET` via SST Secrets / SSM
  Parameter Store, never committed (`.env` is gitignored; only `.env.example`
  ships).
- **Migrations** — `prisma migrate deploy` (`npm run db:migrate`) as a release
  step against the managed database (e.g. RDS / Neon), separate from the app
  user used at runtime.
- **Logs & failure modes** — CloudWatch for app logs; the import flow already
  fails safe (validate-then-write, per-row error reporting, idempotent re-runs).
- **Cost** — small: a serverless/managed Postgres and Next.js on Lambda/edge;
  effectively idle-cost for a demo.

### Local build note
`next build` (webpack) fails on this Windows machine with an `EPERM` error while
scanning the user-home `Application Data` junction (triggered by an unrelated
lockfile in the home directory). The build scripts use **Turbopack**
(`next build --turbopack`), which builds cleanly; `outputFileTracingRoot` is also
pinned in [next.config.js](next.config.js).

---

## Assumptions & tradeoffs

- **Credentials auth** (email + password) was chosen over OAuth for a
  self-contained demo with deterministic seed logins. Swapping in an OAuth
  provider is straightforward (the Prisma adapter is already wired).
- **ExcelJS over SheetJS (`xlsx`)** — the npm `xlsx` package has open security
  advisories with fixes only on its CDN; ExcelJS is maintained cleanly on npm.
- **File upload as base64 through tRPC** — PubMed exports are tiny, so this keeps
  the import inside the typed API rather than adding a separate multipart route.
  For large files a presigned-upload route would be better.
- **No pagination yet** — `article.list` filters/sorts server-side but returns
  the full result set; fine for typical project sizes, listed under future work.
- **One review per article** — simpler and explainable; multi-reviewer screening
  is future work.

---

## AI usage

This project was built with **Claude Code** (Anthropic) as a pair-programming
assistant, used heavily across scaffolding, the Prisma schema, the tRPC
authorization layer, the import pipeline, the table UI, and the tests.

**What I personally verified** (not just accepted):
- Ran the app end-to-end against the real `sample_article_import.xlsx` and
  confirmed the import counts (25 rows → 22 imported / 2 duplicates / 1 error)
  and idempotent re-import.
- Verified the authorization model by signing in as different seeded users and
  confirming an outsider gets 403 / 404 on another org's project and articles.
- Ran `npm test`, `npm run typecheck`, and `npm run build` to green.
- Verified the live deployment end-to-end: sign-in against the production Neon
  database succeeds (session cookie issued) and wrong credentials surface the
  error toast.

**One example where I corrected AI output:** the production `next build`
initially failed with a Windows `EPERM` error. The first attempted fix
(pinning `outputFileTracingRoot`) did **not** resolve it; the actual fix was
switching the build to **Turbopack**, after confirming the failure came from
webpack globbing the user-home directory. (Also relaxed the scaffold's required
Discord env vars, which would otherwise have blocked boot, since we don't use
OAuth.)

---

## What I'd improve next

- Pagination / virtualized table for very large projects.
- Multi-reviewer screening with conflict resolution and an audit trail.
- Saved filters / table views.
- Project & organization management UI (currently created via seed/API).
- Optimistic UI updates for decisions.
- AWS (SST) deployment with the secrets/migrations setup described above.

---

## Approximate time spent

~9 hours, including design, implementation, manual verification, and tests.
