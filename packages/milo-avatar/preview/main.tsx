import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/share-tech-mono/400.css';
import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import { MiloAvatar, RECOMMENDED_STYLE, STYLES, Sprite, composeFrame, type MiloState, type MiloStyleId } from '../src/milo';
import './preview.css';

const LINES = {
  plan: 'Mission plan is ready. Three tickets are queued for agents.',
  decision: 'Session 2 needs your call on the auth provider before it can continue.',
  pickup: "Picking up the package build. I'll report back when it's green.",
};
const SPEAK_AT = 1500;
const ORDER: MiloStyleId[] = ['crt', 'mono'];
const TAGLINE = 'One command center. Every agent. Total operational awareness.';

function Options() {
  return (
    <div className="sheet" data-capture="options">
      <h1 className="sheet-title">MILO <span>// renderings</span></h1>
      <div className="grid-3">
        {ORDER.map((id, i) => (
          <section key={id} className="col">
            <h2 className="col-title">
              <b>{String.fromCharCode(65 + i)}</b> {STYLES[id].name}
              <span>{STYLES[id].blurb}</span>
              {id === RECOMMENDED_STYLE && <em>recommended</em>}
            </h2>
            <MiloAvatar variant={id} state="idle" size="md" at={0} caption={false} />
            <MiloAvatar variant={id} speaking={LINES.plan} size="md" at={SPEAK_AT} />
          </section>
        ))}
      </div>
    </div>
  );
}

function InboxPane({ variant }: { variant: MiloStyleId }) {
  return (
    <div className="pane">
      <div className="pane-h"><span className="chip hot">Inbox</span><span className="dim">WF-14 · package build · session 2</span></div>
      <div className="pane-b">
        <MiloAvatar variant={variant} size="sm" state="alert" />
        <div className="msgs">
          <div className="msg"><div className="meta">MILO · 10:42</div>Session 2 needs your call on the auth provider before it can continue.</div>
          <div className="msg"><div className="meta">agent-2 · 10:42</div>GitHub OAuth keeps the CLI login simple; magic links need an email service.</div>
          <div className="answer"><span>Use GitHub OAuth</span><span>Magic links</span><span className="dim">Reply...</span></div>
        </div>
      </div>
    </div>
  );
}

function LandingSection({ variant }: { variant: MiloStyleId }) {
  return (
    <section className="landing">
      <div className="landing-copy">
        <div className="eyebrow">Mission Intelligence &amp; Logistics Operator</div>
        <h3>Meet MILO</h3>
        <p>MILO runs the mission while you stay on the decisions. It plans the work, briefs your agents, and pings you only when a call is yours to make.</p>
        <ul>
          <li><b>Plans</b> missions from your repo and tracker</li>
          <li><b>Briefs</b> every agent session it launches</li>
          <li><b>Asks</b> only when a decision needs you</li>
        </ul>
      </div>
      <MiloAvatar variant={variant} size="lg" speaking={LINES.plan} at={2300} />
    </section>
  );
}

function States({ variant }: { variant: MiloStyleId }) {
  const states: { s: MiloState; title: string; speaking?: string; at: number }[] = [
    { s: 'idle', title: 'Idle', at: 0 },
    { s: 'speaking', title: 'Speaking', speaking: LINES.plan, at: SPEAK_AT },
    { s: 'thinking', title: 'Thinking', at: 2 * 520 },
    { s: 'alert', title: 'Alert · decision waiting', at: 0 },
  ];
  return (
    <div className="sheet" data-capture="states">
      <h1 className="sheet-title">MILO <span>// {STYLES[variant].name.toLowerCase()} · states</span></h1>
      <div className="grid-4">
        {states.map((x) => (
          <section key={x.s} className="col">
            <h2 className="col-title"><b>{x.title}</b></h2>
            <MiloAvatar variant={variant} state={x.s} speaking={x.speaking} size="md" at={x.at} />
          </section>
        ))}
      </div>
      <div className="context">
        <div>
          <h2 className="col-title sub"><b>Command center</b><span>Inbox conversation pane</span></h2>
          <InboxPane variant={variant} />
        </div>
        <div>
          <h2 className="col-title sub"><b>Landing page</b><span>MILO section</span></h2>
          <LandingSection variant={variant} />
        </div>
      </div>
    </div>
  );
}

const SCRIPT: { state: MiloState; speaking?: string; ms: number; log?: string; hot?: boolean }[] = [
  { state: 'idle', ms: 2200 },
  { state: 'thinking', ms: 1900 },
  { state: 'speaking', speaking: LINES.plan, ms: LINES.plan.length * 55 + 800, log: LINES.plan },
  { state: 'alert', ms: 2400, log: LINES.decision, hot: true },
  { state: 'speaking', speaking: LINES.decision, ms: LINES.decision.length * 55 + 800 },
  { state: 'thinking', ms: 1300 },
  { state: 'speaking', speaking: LINES.pickup, ms: LINES.pickup.length * 55 + 800, log: LINES.pickup },
  { state: 'idle', ms: 1400 },
];

function Demo({ variant }: { variant: MiloStyleId }) {
  const [i, setI] = useState(0);
  const step = SCRIPT[i % SCRIPT.length];
  useEffect(() => {
    const id = setTimeout(() => setI((n) => n + 1), step.ms);
    return () => clearTimeout(id);
  }, [i, step.ms]);
  const loop = Math.floor(i / SCRIPT.length);
  const log = SCRIPT.slice(0, (i % SCRIPT.length) + 1).filter((s) => s.log);
  return (
    <div className="sheet demo" data-capture="demo" data-step={i % SCRIPT.length} data-loop={loop}>
      <MiloAvatar variant={variant} size="lg" state={step.state} speaking={step.speaking} />
      <div className="pane tall">
        <div className="pane-h"><span className={`chip ${step.state === 'alert' ? 'hot' : ''}`}>Inbox</span><span className="dim">comms with MILO</span></div>
        <div className="msgs pad">
          {log.map((s, k) => (
            <div key={k} className={`msg ${s.hot ? 'hot' : ''}`}>
              <div className="meta"><MiloAvatar variant={variant} size="xs" state={s.hot ? 'alert' : 'idle'} /> MILO · 10:4{k}</div>
              {s.log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Brand exports. Captured at deviceScaleFactor 1 so every sprite pixel is an integer block of screen pixels. */
function BrandSquare({ n }: { n: number }) {
  const rows = composeFrame(STYLES.crt.art, { eyes: 'open', mouth: 'rest' });
  const scale = Math.floor(n / 32);
  return (
    <div className="brand-square" data-capture="square" style={{ width: n, height: n, ['--px' as string]: `${scale}px` }}>
      <Sprite rows={rows} palette={STYLES.crt.palette} scale={scale} />
    </div>
  );
}

function Favicon({ px }: { px: number }) {
  const rows = composeFrame(STYLES.crt.mini, { eyes: 'open', mouth: 'rest' });
  return (
    <div className="favicon" data-capture="favicon" style={{ width: px, height: px }}>
      <Sprite rows={rows} palette={STYLES.crt.palette} scale={px / 16} />
    </div>
  );
}

/** card: social preview / Open Graph; header: X profile header (avatar overlaps bottom-left, so content sits right). */
function Banner({ w, h, layout, url }: { w: number; h: number; layout: 'card' | 'header'; url?: string }) {
  const u = h / 640;
  const rows = composeFrame(STYLES.crt.art, { eyes: 'open', mouth: 'rest' });
  return (
    <div className={`banner ${layout}`} data-capture="banner" style={{ width: w, height: h, ['--u' as string]: `${u}px` }}>
      {layout === 'card' ? (
        <div className="banner-feed"><MiloAvatar variant="crt" size={Math.floor(11 * u)} state="idle" at={0} caption={false} /></div>
      ) : null}
      <div className="banner-copy">
        <div className="social-chip">MILO // ONLINE</div>
        <div className="wordmark">MILOOPS</div>
        <div className="social-cat">Autonomous Agent Command Center</div>
        <div className="social-tag">{TAGLINE}</div>
        <div className="social-cmd"><span>$</span> npx miloops{url && <em>{url}</em>}</div>
      </div>
      {layout === 'header' ? (
        <div className="banner-sprite"><Sprite rows={rows} palette={STYLES.crt.palette} scale={Math.floor(h / 32) - 1} /></div>
      ) : null}
    </div>
  );
}

function Playground() {
  const [variant, setVariant] = useState<MiloStyleId>(RECOMMENDED_STYLE);
  const [state, setState] = useState<MiloState>('idle');
  const [size, setSize] = useState<'sm' | 'md' | 'lg'>('lg');
  const [line, setLine] = useState(LINES.plan);
  const [speakingNow, setSpeakingNow] = useState('');
  return (
    <div className="sheet">
      <h1 className="sheet-title">MILO <span>// playground</span></h1>
      <div className="controls">
        {ORDER.map((v) => <button key={v} className={v === variant ? 'on' : ''} onClick={() => setVariant(v)}>{STYLES[v].name}</button>)}
        <span className="gap" />
        {(['idle', 'thinking', 'alert'] as MiloState[]).map((s) => (
          <button key={s} className={s === state && !speakingNow ? 'on' : ''} onClick={() => { setSpeakingNow(''); setState(s); }}>{s}</button>
        ))}
        <button className={speakingNow ? 'on' : ''} onClick={() => { setState('speaking'); setSpeakingNow(line); }}>speak</button>
        <span className="gap" />
        {(['sm', 'md', 'lg'] as const).map((s) => <button key={s} className={s === size ? 'on' : ''} onClick={() => setSize(s)}>{s}</button>)}
      </div>
      <input className="line-input" value={line} onChange={(e) => setLine(e.target.value)} />
      <div className="play">
        <MiloAvatar variant={variant} size={size} state={state} speaking={speakingNow} onSpeakEnd={() => { setSpeakingNow(''); setState('idle'); }} />
      </div>
      <p className="links">
        <a href="?view=options">options</a> · <a href={`?view=states&variant=${variant}`}>states</a> · <a href={`?view=demo&variant=${variant}`}>demo loop</a> · <a href="?view=banner">social card</a> · <a href="?view=banner&w=1500&h=500&layout=header">X header</a> · <a href="?view=square&n=1000">org avatar</a>
      </p>
    </div>
  );
}

function App() {
  const q = new URLSearchParams(location.search);
  const view = q.get('view');
  const variant = (q.get('variant') as MiloStyleId) || RECOMMENDED_STYLE;
  if (view === 'options') return <Options />;
  if (view === 'states') return <States variant={variant} />;
  if (view === 'demo') return <Demo variant={variant} />;
  if (view === 'square') return <BrandSquare n={Number(q.get('n') || 512)} />;
  if (view === 'favicon') return <Favicon px={Number(q.get('px') || 64)} />;
  if (view === 'banner') return <Banner w={Number(q.get('w') || 1280)} h={Number(q.get('h') || 640)} layout={(q.get('layout') as 'card' | 'header') || 'card'} url={q.get('url') || undefined} />;
  return <Playground />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
