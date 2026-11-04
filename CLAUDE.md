# CLAUDE.md

A cross-stitch pattern maker: a static React app (Vite, TypeScript), deployed to GitHub Pages at shawnkoski.com/cross-stitch/. See `README.md` for commands, the design system dependency, and deploying, `todo.md` for ideas and what's next, and `revisit.md` for loose ends in work that's landed: checks not done yet, known problems, and why things were built the way they were. Keep both up to date as items land or get settled.

It started as an experiment in the design system's Storybook and moved here on 2026-10-31.

## Layout

```
src/main.tsx                   the page: header and the tool
src/app.css                    the page around the tool
src/CrossStitch.tsx            the tool: controls, the chart canvas, pointer and keyboard stitching, floating text
src/cross-stitch.css           the tool's styles, using the design system's tokens
src/pattern.ts                 the pattern, editing it, and turning a photo into one (no DOM; unit tested)
src/text.ts                    fonts, and text as stitches (the layout is unit tested; drawing needs a browser)
src/chart.ts                   drawing the chart on a canvas: on the page, and as a saved image
src/pdf.ts                     the pattern as a PDF, written by hand with no library (no DOM; unit tested)
src/patternFile.ts             the pattern file: saving as JSON, and checking a file before opening it (no DOM; unit tested)
src/*.test.ts                  unit tests, in Node
src/*.browser.test.tsx         the whole tool in Chromium, with axe
```

## Rules

- Before saying a change is done, run `pnpm typecheck`, `pnpm test`, and `pnpm build`, and look at it in a browser (`pnpm dev`, or a Playwright screenshot of `pnpm preview`).
- Never delete, skip, weaken, or comment out a test to make something pass, unless the user explicitly says so. If a test fails, fix the code, or explain why the test is wrong and let the user decide.
- Commit and push only when the user asks. Pushing to `main` deploys the live site.
- The controls come from the design system package. Don't copy or restyle its components here: if one is missing something or is broken, that's a fix in the design-system repo, and a sign the package needs work. Style the tool with the design system's tokens (`var(--space-4)`, `var(--ink-muted)`).
- The chart is a canvas, so it needs its own accessibility: the keyboard can do everything the pointer can, and changes are announced in the live region.
- Writing: sentence case, short plain sentences, the Oxford comma, buttons that start with a verb and say what happens, no periods in labels and buttons, and no emoji.
