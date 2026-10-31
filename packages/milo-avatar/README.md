# MILO avatar

`MiloAvatar` is a pixel-art "video feed" for MILO (Mission Intelligence & Logistics Operator), the voice of MILOOPS.
MILO is an original character: a calm, head-only CRT monitor robot with dark glass, steady eyes, headphones joined by a headband, and a status light on top of the band.

- **Art:**
  - The 32×32 master head is used at `sm`, `md` and `lg`.
  - A hand-simplified 16×16 head is used for `xs` and the favicons.
  - Both come from the approved v4 CRT concept.
- **Renderings:**
  - `crt` (recommended): the calm, desaturated colour palette.
  - `mono`: a single-ink HUD version of the same head.
- **States:**
  - `idle`: steady eyes and a flat mouth, with the status light on. Blinks every ~5.6s.
  - `speaking`: the mouth line follows the text, and a pixel waveform shows only while MILO talks.
  - `thinking`: the eyes and mouth shift aside, and the status light pulses between dim and on.
  - `alert`: a decision is waiting. The eyes go taller, the status light turns red and the panel frame turns warning red.
- **Dependencies:** React 18 only, with no network calls. There is also a framework-free renderer, `mountMilo`, for non-React pages.

`npm run capture` writes `milo-avatar-options.png`, `milo-avatar-states.png`, `milo-avatar-demo.mp4` and the brand kit (`brand/`) to `captures/` (or `$OUT_DIR`). The finalized brand kit is committed at the repo root in `brand/`.

## Files

```
src/milo/
  art.ts           GENERATED pixels: palette, 32×32 base head + eye/mouth/light patches, 16×16 mini (do not hand edit)
  frames.ts        styles (crt/mono), expressions per state, status labels, timing, visemes, composeFrame/composeWave
  types.ts         shared types
  miloFrame.ts     what MILO shows at a moment (state, face, layout, labels), shared by both renderers
  rects.ts         sprite and waveform rects (horizontal runs merged)
  MiloAvatar.tsx   React component; Sprite.tsx, Wave.tsx and hooks/ (reduced motion, clock, blink)
  mountMilo.ts     framework-free renderer with the same markup, classes and timing (for the vanilla landing page); miloDom.ts builds its elements
  MiloAvatar.css   HUD panel frame; all colors are --milo-* vars with command-center fallbacks
  index.ts         React exports (import mountMilo from './mountMilo' directly)
preview/           preview page (?view=options | states | demo | square | favicon | banner); App.tsx routes to views/
tools/
  bake-art.mjs     node tools/bake-art.mjs src/milo/art.ts: renders the v4 CRT states, diffs them into patches, verifies, writes art.ts
  capture.mjs      writes the PNGs, the MP4 loop and brand/* (Playwright + system Chrome + ffmpeg)
  outline.mjs      helper: adds a 1px outline around a hand-drawn fill grid
  robot-concepts*.mjs  concept explorations v1–v4 (milo-robot-*.png); v4 is the source the bake reads
```

## Command center

The command center imports the component from `@miloops-hq/milo-avatar`.

It reads the command-center tokens, so it follows the active fonts and palette:

- `--mono`, `--display`, `--sans`
- `--urgent`
- `--line`, `--line2`, `--panel`

`Inbox.tsx` → `Conversation` renders a `sm` panel at the top of the conversation pane, next to the ticket title:

```tsx
<MiloAvatar size="sm" state={pending ? 'alert' : 'idle'} />
```

There is no onboarding placement. The activity log keeps `MiloMark`.

## Landing page

The landing page has a copy of the framework-free files in `src/milo/` (`art.ts`, `frames.ts`, `types.ts`, `mountMilo.ts`, `MiloAvatar.css`). It does not use React.

The "Meet MILO" section (`#milo`) mounts an `lg` panel:

- It plays its `data-milo-line` once when the section scrolls into view, then holds the caption with the status back at `ONLINE`.
- Below 400px wide it uses `md`.

```ts
const milo = mountMilo(host, { size: 'lg', caption: true });
milo.update({ speaking: "I keep your mission moving. When a call is yours, I'll ask you." });
milo.destroy();
```

`--milo-warn`, `--milo-line`, `--milo-line2` and `--milo-panel` are mapped to the landing tokens on `.meet__avatar .milo`.

## API

| Prop | Default | Notes |
| --- | --- | --- |
| `state` | `'idle'` | `idle` \| `speaking` \| `thinking` \| `alert` |
| `size` | `'md'` | `xs` is the 16×16 head at 2× (32px). `sm` is the 32×32 head at 3× (96px), `md` at 5× (160px) and `lg` at 7× (224px). A number sets a custom integer scale. |
| `speaking` | none | A non-empty string switches `idle`/`speaking` to speaking. `alert` and `thinking` keep priority. Once the line has played, the caption stays and the status returns to `ONLINE`. |
| `variant` | `'crt'` | `crt` \| `mono` |
| `framed` | `true` (except `xs`) | HUD panel with the `MILO // ONLINE` label. |
| `caption` | `true` for md/lg | Shows the spoken line under the waveform. |
| `label` | `'MILO'` | Panel name and accessible name. |
| `onSpeakEnd` | none | Fires about 350ms after the line has played. It also fires under reduced motion. |
| `at` | none | Freezes the clock at N ms. Used for screenshots and tests. |

`mountMilo(host, options)` takes the same options except `at`, `className` and `style`. It returns `{ update(partial), destroy() }`.

## Motion rules

- Motion happens only on state changes or ongoing states. There's no ambient or decorative animation. The allowed motion is:
  - the blink (framed panels, idle and speaking only)
  - the mouth and waveform while a line plays
  - the thinking status-light pulse (520ms step)
  - a two-pulse ring when `alert` begins
- With `prefers-reduced-motion: reduce`, and always at `xs`, nothing animates:
  - Speaking shows one static mouth frame, a static waveform and the full caption. It still calls `onSpeakEnd` after the same duration.
  - Thinking holds the light dim.
  - The alert pulse is off.
- Timers run only while something is animating. Re-renders are capped at 25/s while speaking.
- Screen readers get `role="img"` with "MILO, online / transmitting / processing / decision waiting", plus the full line once via `aria-live="polite"`.

## Palette

The palette is calm and desaturated:

- light-gray shell
- slate headphones
- dark glass with pale-blue eyes and mouth
- desaturated orange for the status light and the leading edge of the waveform

Saturated red appears only in `alert`: the status light and the panel frame (`--milo-warn` → `--urgent`). Override `--milo-*` variables on a parent to retheme the panel.

## Changing the art

Edit the CRT concept in `tools/robot-concepts-v4.mjs` (`CONCEPTS.crt`, `face()`, `MINI.crt`), then re-bake:

```
node tools/bake-art.mjs src/milo/art.ts
```

The bake fails if the patches don't reproduce every state exactly. Copy the regenerated `art.ts` to both apps afterwards.

## Preview, captures and brand kit

```
npm install
npm run dev                  # playground at http://localhost:5173 (+ ?view=options|states|demo)
npm run build
npm run capture              # needs Chrome (CHROME=...) and ffmpeg
```

`capture` also renders `brand/` at exact pixel sizes, with integer sprite scales on the dark HUD background:

- `github-org-avatar.png` (1000²)
- `github-social-preview.png` (1280×640)
- `og-image-1200x630.png`
- `x-header-1500x500.png`
- `wordmark-lockup.png`: the logo lockup, mini MILO beside the wordmark
- `x-avatar-400.png`
- `slack-icon-512.png`
- `linkedin-discord-avatar-512.png`
- `favicon-64.png`, `favicon-32.png`
- `social-kit-overview.png`: a contact sheet with checks at 16 to 48px

The banner copy is agent-agnostic. The brand views are `?view=square&n=`, `?view=favicon&px=` and `?view=banner&w=&h=&layout=card|header`.
