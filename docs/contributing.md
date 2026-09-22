# Contributing to RouteDots

Thanks for taking the time to contribute! This document explains how the
project is organised and how to make a clean, mergeable contribution.

## Getting started

```bash
git clone https://github.com/Airya-Xratu/RouteDots.git
cd RouteDots
npm install
```

Useful scripts:

| Script                 | What it does                                                          |
| ---------------------- | --------------------------------------------------------------------- |
| `npm run build`        | Build library bundles (ESM/CJS/dts + browser)                         |
| `npm test`             | Run the unit test suite (Vitest)                                      |
| `npm run test:watch`   | Run tests in watch mode                                               |
| `npm run lint`         | ESLint over the whole repo                                            |
| `npm run format`       | Prettier write                                                        |
| `npm run format:check` | Prettier check (used in CI)                                           |
| `npm run typecheck`    | `tsc --noEmit`                                                        |
| `npm run test:e2e`     | Playwright end-to-end tests (needs `npx playwright install chromium`) |

## Branching model (GitHub Flow)

- **`main`** — always releasable. Only receives PRs from `develop`.
- **`develop`** — integration branch. All feature work lands here first.
- **feature branches** — created from `develop`, short-lived, one logical piece
  of work per branch.

Branch naming:

```
<type>/<phase-or-id>-<short-kebab-summary>

# e.g.
feature/phase-2-geo-engine
fix/route-arc-z-fighting
chore/bump-ci-node
```

## Commit conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <summary in imperative mood>

[optional body: why the change was made, what it affects]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`.

Rules of thumb:

- One commit = one logical change. No "wip" commits in a PR.
- The summary fits on one line (≤ 72 chars); the body explains _why_, not _what_.
- Rebase your branch on `develop` before requesting review to keep history linear.

## Pull request process

1. Create the feature branch from an up-to-date `develop`.
2. Implement, with tests for every behaviour change.
3. Run locally: `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build`.
4. Open a PR against `develop` using the template.
5. Update `CHANGELOG.md` under `[Unreleased]` (see below).
6. The PR is squash-merged so `develop` history stays one commit per PR.
7. The branch is deleted after merge.

## Changelog

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Every PR that changes user-visible behaviour (API, options, visuals, fixes)
adds an entry under `## [Unreleased]` in the right section (`Added`,
`Changed`, `Fixed`, …). The entry is written in the past tense and references
the PR number, e.g.:

```md
### Added

- Outbound/return arc separation for round trips ([#12](…))
```

## Code style

- **TypeScript, strict mode.** No `any` without a comment justifying it.
- Prettier is the source of truth for formatting; ESLint for the rest
  (`npm run lint` must pass with zero errors).
- Prefer small, pure, well-named functions. Anything testable without a DOM
  or a WebGL context belongs in the pure core (`src/core/`).
- Keep three.js usage isolated in the renderer layers so the geo/math core
  stays pure and unit-testable in Node.
- Public API changes require a docs update (`docs/developer-guide.md`) and a
  changelog entry.

## Testing expectations

- New behaviour → new unit tests in the matching `*.test.ts` file.
- Bug fix → a regression test that fails without the fix.
- Pure modules (geo math, rasterizer, schedulers) are tested numerically with
  property-style assertions, not just happy-path values.
- Rendered features (globe, arcs, plane) additionally get Playwright E2E
  coverage in `e2e/`.

## Data & assets

- The bundled world land mask (`src/data/land-110m.ts`) is derived from
  [world-atlas](https://github.com/topojson/world-atlas) (Natural Earth data,
  public domain; world-atlas is MIT). Regenerate it with the script in
  `tools/` if you change the resolution.
- Never commit generated output (`dist/`, `coverage/`, `.playwright/`).
