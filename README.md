# Cross stitch pattern maker

Design cross-stitch patterns in the browser: draw on a grid, add words in a choice of fonts, or turn a photo into a chart with as few thread colors as you like. Each color gets a symbol and a stitch count, as printed charts do.

Live at [shawnkoski.com/cross-stitch](https://shawnkoski.com/cross-stitch/).

Ideas and what's next: [todo.md](todo.md).

## Running it

```sh
pnpm install          # needs SSH access to github.com/snkoski/design-system (see below)
pnpm dev              # http://localhost:5173/cross-stitch/
pnpm typecheck
pnpm test             # unit tests (Node) and browser tests (Chromium); first time: pnpm exec playwright install chromium
pnpm build            # dist/
```

## The design system

The controls (buttons, the switch, the segmented controls, and the text area) and the tokens come from [design-system](https://github.com/snkoski/design-system), installed as a package from its GitHub repo, pinned to a commit. It's private, so installing needs SSH access to it: your own key locally, and a read-only deploy key (the `DESIGN_SYSTEM_DEPLOY_KEY` secret) in GitHub Actions.

To move to a newer version, change the commit in both `package.json` and `pnpm-workspace.yaml` (pnpm only lets that exact version run its build when it installs), then run `pnpm install`.

## Deploying

Every push to `main` runs the tests and, if they pass, deploys to GitHub Pages (`.github/workflows/deploy.yml`). Pages serves the repo at `/cross-stitch/` on the portfolio's domain, which is why `vite.config.ts` sets `base`.
