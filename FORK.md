# mcclown fork: themes and develop

`develop` is `main` plus every theme branch below, merged in order, plus the develop-only files. It is the single
build for our own instance: each push to `develop` builds `ghcr.io/mcclown/wrapperr:develop`
(`.github/workflows/docker-image-develop.yml`).

Rules:
- Every change lives on the theme branch that owns the code. A fix goes there first, then is merged into
  `develop` (and into any theme stacked on it). Nothing is fixed in `develop` alone.
- Theme PRs are on `mcclown/wrapperr` only, never on `aunefyren/wrapperr`. Each targets `main`, or the theme
  it is stacked on.
- No rebasing a theme once its PR is open; merge `main` (or its parent theme) into it instead.
- Upstream sync: fast-forward `main` to `upstream/main`, then merge `main` into each theme (bottom of a stack
  first) and into `develop`.
- Reviews: before a theme's PR opens, run the `code-review` skill at `high` on it and apply the findings on the
  theme branch (re-run at `medium` after later fix rounds). Internet-facing themes also get `security-review`.
  Some surfaces are exposed through a Cloudflare tunnel: no new unauthenticated endpoints, no stored IPs, and
  `/admin*` is not routed through the tunnel (or sits behind Cloudflare Access). See theme S.
- `scripts/fork/rebuild-develop.sh` rebuilds `main` + the merge order below and diffs it with `develop`.
  Run it before deploying; any difference outside the develop-only files is drift.

## Themes

| # | Theme | Branch | PR | Stacked on | Status | Upstream-able | Last review |
|---|---|---|---|---|---|---|---|
| A1 | Seerr request statistics | `seerr-requests` | #1 | main | open | yes | |
| A2 | Seerr trendsetters and followers | `seerr-trendsetter` | #2 | `seerr-requests` | open | yes | |
| S | Hardening for exposure through a Cloudflare tunnel | `fork/hardening` | | main | planned | yes | |
| C | Viewing analysis (per-account layer, Go) | `fork/viewing-analysis` | | S | planned | yes | |
| D | Plex metadata (episode counts, added dates, backdrops) | `fork/plex-metadata` | | C | planned | yes | |
| E | Voyage data (contract + API) | `fork/voyage-data` | | D | planned | maybe | |
| F | Voyage page | `fork/voyage-page` | | E | planned | maybe | |
| G | Voyage entry and handoff to the classic page | `fork/voyage-entry` | | F | planned | maybe | |
| H | Voyage static export | `fork/voyage-export` | | E | planned | maybe | |

Household splitting (split by device) was dropped on 2026-11-06 as too inaccurate, and theme B
(fuller play records for it) went with it: every calculation is per Plex account.

## Merge order

Read by `rebuild-develop.sh`, one branch per line. A stacked theme only needs its top branch listed once its
parents are in.

<!-- merge-order -->
- seerr-trendsetter
<!-- /merge-order -->

## Develop-only files

<!-- develop-only -->
- FORK.md
- scripts/fork
- .github/workflows/go.yml
- .github/workflows/docker-image-develop.yml
<!-- /develop-only -->
