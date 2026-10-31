# MILOOPS landing page

Static marketing page for [miloops.app](https://miloops.app). Vite + TypeScript, no framework, no runtime dependencies beyond self-hosted fonts (`@fontsource`: Chakra Petch, Share Tech Mono, Barlow). JS is ~6 kB gzipped and only adds scroll reveals, the copy buttons, the walkthrough tabs, the zone highlighter, video pause-when-offscreen and the MILO avatar; the page reads fine without it.

## Run

```bash
npm install
npm run dev        # http://localhost:5173, hot reload
npm run build      # dist/ (static, deploy anywhere)
npm run preview    # serves dist/ on http://localhost:4173
```

Requires Node 20+.

## Product media

Screenshots, the 720p hero video and its poster live in `public/media/`; the favicons, apple-touch icon and OG image live in `public/media/brand/` (copies of the files in the repo's `brand/` folder). Everything is served from this app's own `public/` folder, so `dist/` is self-contained.

The hero video is a curated 61.4 s "A day with MILOOPS" journey (install and connect, `/milo new` interview, map, agents working, briefing, Decisions, an agent asking, `/milo status`, mission switcher). It is rendered separately from captures of the real command center plus terminal and Claude Code scenes; when the UI changes, re-render it with the same scenes, labels and length rather than replacing it with a plain recording.

`npm run media` re-captures the screenshots from the real command center: it onboards, loads the sample mission, charts a second one, answers a question, and opens the briefing and the Decisions log. It never touches the hero video or its poster. Start the command center on an empty local tracker first; the folder name shows as the project name in the header:

```bash
rm -rf /tmp/fieldnote-app && MILOOPS_DIR=/tmp/fieldnote-app/.miloops npm run dev   # repo root
npm run media                                                                       # here
```

Uses Playwright with the system Chrome (`CHROME_PATH`).
- The "Fixed zones" overlay positions are percentages of `command-center-overview.png` (inline `--x/--y/--w/--h` on each `.zone` in `index.html`). `npm run media` prints fresh values measured from the DOM; paste them in when the command-center layout moves.

## Capture

With `npm run preview` running:

```bash
npm run capture                 # all four outputs
npm run capture -- hero mobile  # a subset: hero, desktop, mobile, video
```

Writes `landing-hero.png` (1440×900), `landing-desktop.png` (1440 wide, full page), `landing-mobile.png` (390 wide @2x, full page) and `landing-demo.mp4` (1440×900 scroll-through) to `capture/` (git-ignored; override with `CAPTURE_OUT`). Uses the system Chrome through `puppeteer-core` (`CHROME_PATH`, default `/usr/local/bin/google-chrome`) and `ffmpeg`.

## Structure

- `index.html`: all content and markup. Sections: hero, what it is, meet MILO, how it works (steps + fixed zones), features, showcase rows, open source, FAQ, final CTA, footer.
- `src/styles.css`: design tokens at the top mirror the command center's palette (steel blue accent, copper action, red only for warnings).
- `src/main.ts`: progressive enhancement. Respects `prefers-reduced-motion` (no reveals, no tab autoplay, hero video doesn't autoplay).
- `src/terminal.ts`: the install terminal in step 01 of How it works. It types `npm i -g miloops` → `cd my-app` → `miloops`, then `cd my-app` → `npx miloops`, holds ~3 s on each finished state and loops; under reduced motion (and without JS) it shows the finished first run. `frameAt(t)` is pure, so a doc GIF can be rendered from the same frames.
- `src/milo/`: framework-free copy of the MILO avatar (`mountMilo.ts` + baked art) from `packages/milo-avatar`; re-copy after re-baking there.
- Favicons, apple-touch icon and the OG / Twitter image are in `public/media/brand/`, copied from the repo's `brand/` folder.
- `public/favicon.svg`: the older MILO line mark, no longer linked from `index.html`.

## Meet MILO

`#milo` mounts an `lg` MILO panel into `[data-milo]` (`md` below 400px). It speaks `data-milo-line` once when the section scrolls into view, then holds the caption. Under reduced motion the line shows in full with no animation.

## Open items

- GitHub links in `index.html` point to https://github.com/miloopshq/miloops; the license link assumes the default branch is `main`.
- No analytics, no forms, no external requests.
