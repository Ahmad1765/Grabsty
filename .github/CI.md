# Grabsty CI/CD

Operational runbook for everything under `.github/`. If you're wiring CI for the first time, work top-to-bottom.

## Pipeline at a glance

| Workflow                | Trigger                                            | Purpose                                                             | Required secrets                                     |
| ----------------------- | -------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------- |
| `ci.yml`                | PR + push to `main`/`Backend`, `workflow_dispatch` | Typecheck, web build, npm audit, artifact upload                    | _none required_ (Supabase secrets optional)          |
| `codeql.yml`            | PR + push to `main`, weekly cron                   | TypeScript security analysis (CodeQL)                               | _none_                                               |
| `secrets-scan.yml`      | PR + push to `main`, weekly cron                   | gitleaks scan for committed secrets                                 | _none_ (optional `GITLEAKS_LICENSE` for orgs)        |
| `dependency-review.yml` | PR                                                 | Block PRs that introduce high-severity / disallowed-license deps    | _none_                                               |
| `supabase-check.yml`    | PR/push touching `supabase/*.sql`                  | Apply migrations to ephemeral Postgres to catch syntax/order issues | _none_                                               |
| `vercel-preview.yml`    | PR                                                 | Build + deploy a Vercel preview, comment URL on the PR              | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` |
| `vercel-production.yml` | Push to `main`, `workflow_dispatch`                | Production deploy via Vercel CLI (`--prebuilt`)                     | same as preview                                      |

All Vercel jobs skip cleanly when `VERCEL_TOKEN` is empty — no red Xs on PRs before the project is linked.

## Required vs. optional secrets

Set under **Settings → Secrets and variables → Actions**.

### Optional (CI passes without them)

| Secret                               | Used by              | What it controls                                                                                               |
| ------------------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`           | `ci.yml` (web build) | Inlined into the bundle. When empty, the build still succeeds but the bundle warns and can't talk to Supabase. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY`      | `ci.yml` (web build) | Same as above.                                                                                                 |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `ci.yml` (web build) | Frontend Stripe key. Has a placeholder default.                                                                |
| `GITLEAKS_LICENSE`                   | `secrets-scan.yml`   | Only required for organisations. Personal repos work without it.                                               |

### Required to enable Vercel deploys

| Secret              | How to get it                                                             |
| ------------------- | ------------------------------------------------------------------------- |
| `VERCEL_TOKEN`      | https://vercel.com/account/tokens — create a token scoped to this project |
| `VERCEL_ORG_ID`     | `vercel link` locally, then read `.vercel/project.json`                   |
| `VERCEL_PROJECT_ID` | Same file as above                                                        |

### Recommended GitHub Environments

Configure a `production` environment under **Settings → Environments** to gate `vercel-production.yml` behind manual approval or a wait timer. The workflow already declares `environment: production` so any protection rule you add is enforced automatically.

## Branch protection

Once CI is green on a few PRs, enable on `main`:

- **Require status checks to pass** → select `Required checks` (the aggregator job in `ci.yml`).
- **Require pull request before merging** → 1 approval, dismiss stale approvals.
- **Require linear history** (optional, keeps `git log` readable).
- **Restrict who can push to matching branches** to maintainers only.

`Backend` can have lighter protection (just `Required checks`) since it's an active development branch.

## Local equivalents of each job

Run these to repro CI locally before pushing:

```powershell
# Typecheck
npx tsc --noEmit

# Web build (same command CI runs)
npm run build

# Lockfile freshness (CI uses `npm ci`, which fails on drift)
npm ci --no-audit --no-fund --dry-run

# Audit
npm audit --omit=dev --audit-level=high

# gitleaks (Windows: scoop install gitleaks; macOS: brew install gitleaks)
gitleaks detect --no-banner --redact
```

## Composite action — `setup-project`

`.github/actions/setup-project/action.yml` centralises checkout/Node/install so a Node-version bump touches one file. Use it from any new workflow:

```yaml
- uses: actions/checkout@v4
- uses: ./.github/actions/setup-project
  with:
    node-version: "22" # optional, defaults to 22
    install: "true" # optional, set "false" to skip npm ci
```

## Dependabot policy

`dependabot.yml` opens PRs weekly. Minor + patch updates are grouped per ecosystem to keep PR volume sane; majors stay individual so the breaking change can be reviewed in isolation. Expo and React Native are explicitly excluded — bump them with `npx expo install --check`, not Dependabot.

## CODEOWNERS

`.github/CODEOWNERS` auto-assigns reviewers based on the file pattern. Anything under `/.github/`, `/supabase/`, `/lib/auth.tsx`, `/lib/supabase.ts`, or `/app/payment/` pulls in the default owner explicitly because regressions there have outsized blast radius.

## Issue / PR templates

- `PULL_REQUEST_TEMPLATE.md` — surfaces the test plan, DB-change checklist, and rollback story on every PR.
- `ISSUE_TEMPLATE/bug_report.yml` — structured bug intake with platform dropdown.
- `ISSUE_TEMPLATE/feature_request.yml` — leads with the user need before the proposed solution.
- `ISSUE_TEMPLATE/config.yml` — disables blank issues and routes security reports to private advisories.

## Adding a new check

1. Add the job to `ci.yml` (or a new workflow if it warrants its own schedule).
2. Run it locally first (use the `act` tool if you want a faithful runner emulation).
3. If it should block merges, add it to the `required-checks` aggregator job's `needs:` list and to the branch protection's required-check list.

## Troubleshooting

- **Web build fails with a Supabase warning** → the warning is informational; if the build itself errors, check that `EXPO_PUBLIC_SUPABASE_URL` is a valid URL when set (an invalid value can cause `URL` parsing to throw in the bundler).
- **`npm ci` fails on lockfile drift** → run `npm install` locally, commit the updated `package-lock.json`, push.
- **CodeQL job times out** → bump `timeout-minutes` in `codeql.yml`. The default 30 min is generous for this codebase size.
- **gitleaks flags a false positive** → add a `.gitleaks.toml` allowlist entry rather than skipping the scan. Document the reason in a comment.
- **Vercel preview job is silent** → check the `preflight` job logs. It emits a `::notice` when `VERCEL_TOKEN` is missing; the deploy job is skipped (not failed) in that case.
