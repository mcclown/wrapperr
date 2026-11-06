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
- `scripts/fork/rebuild-develop.sh` rebuilds `main` + the merge order below and diffs it with `develop`.
  Run it before deploying; any difference outside the develop-only files is drift.

## Themes

| # | Theme | Branch | PR | Stacked on | Status | Upstream-able |
|---|---|---|---|---|---|---|
| A1 | Seerr request statistics | `seerr-requests` | #1 | main | open | yes |
| A2 | Seerr trendsetters and followers | `seerr-trendsetter` | #2 | `seerr-requests` | open | yes |
| B | Fuller play records in the cache | `fork/play-cache-detail` | | main | planned | yes |
| C | Viewing analysis (per-person layer, Go) | `fork/viewing-analysis` | | B | planned | yes |
| D | Plex metadata (episode counts, added dates, backdrops) | `fork/plex-metadata` | | C | planned | yes |
| E | Voyage data (contract + API) | `fork/voyage-data` | | D | planned | maybe |
| F | Voyage page | `fork/voyage-page` | | E | planned | maybe |
| G | Voyage entry and handoff to the classic page | `fork/voyage-entry` | | F | planned | maybe |
| H | Voyage static export | `fork/voyage-export` | | E | planned | maybe |

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
