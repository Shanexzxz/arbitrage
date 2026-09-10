# Deploy — Cloudflare Pages

Publishes this app (static frontend + edge Functions) to Cloudflare Pages via
`wrangler` direct upload. Self-contained and portable: no absolute paths, no
WorkBuddy-specific tooling. Works on any machine with `node`, `wrangler`
(or `npx`), `rsync` and `bash`.

## Why a build step

The app normally runs behind `server/proxy.js` (Node/Express), which serves the
static files **and** two API routes. Pages only hosts static assets, so the two
routes are re-implemented as Pages Functions in `deploy/functions/`:

| Route | Function | Notes |
|---|---|---|
| `/quote` | `functions/quote.js` | Yahoo Finance CORS proxy |
| `/api/changelog` | `functions/api/changelog.js` | git-log snapshot, baked at build time (the edge has no git) |

## One-time setup

```bash
wrangler login                                    # OAuth, once per machine
wrangler pages project create hynix-arbitrage --production-branch=main
```

`*.pages.dev` is a **global namespace** shared across all Cloudflare accounts.
If your chosen name is taken, Cloudflare appends a random suffix
(`arbitrage` → `arbitrage-5qo`) that is permanent. Probe first:
`curl -sL -o /dev/null -w "%{http_code}" https://<name>.pages.dev/`
— `000` (DNS doesn't resolve) means free.

## Deploy

```bash
./deploy/deploy.sh                       # public build — changelog stripped
INCLUDE_CHANGELOG=1 ./deploy/deploy.sh   # internal build — changelog kept
PROJECT=other-name ./deploy/deploy.sh    # deploy to a different project
```

The script builds `dist/` (gitignored), injects the Functions, strips or keeps
the changelog, deploys, then verifies every route from the public URL.

## Changelog visibility

The commit history lives in this repo, but the **public** build removes it
entirely — the nav link, the page section, *and* the backing Function — so
external viewers can't read it in the page or by hitting `/api/changelog`
directly. Use `INCLUDE_CHANGELOG=1` for an internal deploy that keeps it.

## Gotchas

- **Deploy runs from inside `dist/`** (the script handles this). `wrangler`
  resolves `functions/` relative to the current directory, not the asset-dir
  argument — deploying from elsewhere silently skips Functions and every API
  route falls back to `index.html` (HTTP 200 with an HTML body).
  Success shows `Compiled Worker successfully` + `Uploading Functions bundle`.
- **`curl` needs `-L`** — Pages 301-redirects `/index.html` → `/`.
