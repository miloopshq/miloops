# MILOOPS landing page

Static marketing site for [miloops.app](https://miloops.app): Vite + TypeScript, no framework. Three pages share one stylesheet and one script:

- `index.html`: Home, the story (mission, crew, MILO, you) and what's coming.
- `features/index.html`: everything that ships today, and the upcoming directions in detail.
- `specialists/index.html`: the specialist marketplace story and its waitlist.

Shared markup lives in `partials/` (`sprite`, `nav`, `footer`) and is pasted in at build time by `<!-- @include name -->` (see `vite.config.ts`).

Type is Geist Pixel for headlines and labels and Geist for everything else, both self-hosted through `@fontsource`. JS adds the hero "mission field" animation (`src/heroField.ts`, paused off-screen, a still frame with reduced motion), the badge scramble, scroll reveals, copy buttons, the MILO avatar and the waitlist form. The pages read fine without it.

## Run

```bash
npm install
npm run dev        # http://localhost:5173, hot reload
npm run build      # dist/ (static, deploy anywhere)
npm run preview    # serves dist/ on http://localhost:4173
```

Requires Node 20+.

## Waitlist

The `/specialists` form POSTs `{ email, list: "specialists" }` as JSON to `VITE_WAITLIST_URL` when that is set at build time. Without it, the form opens a prefilled email to `hello@miloops.app`.

## Product media

Screenshots live in `public/media/`; favicons and the OG image in `public/media/brand/`. `npm run media` re-captures every screenshot from the real command center: it onboards, loads the sample mission, charts a second one, answers a question, and opens the briefing and the Decisions log. Start the command center on an empty local tracker first; the folder name shows as the project name in the header:

```bash
rm -rf /tmp/fieldnote-app && MILOOPS_DIR=/tmp/fieldnote-app/.miloops npm run dev   # repo root
npm run media                                                                       # here
```

Uses Playwright with the system Chrome (`CHROME_PATH`).

## Capture

With `npm run preview` running:

```bash
npm run capture                 # all four outputs
npm run capture -- hero mobile  # a subset: hero, desktop, mobile, video
```

The video is a scroll-through recording of Home and needs `ffmpeg` on `PATH`.
