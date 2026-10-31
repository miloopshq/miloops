import { useState } from 'react';
import { MiloAvatar, RECOMMENDED_STYLE, STYLES, type MiloState, type MiloStyleId } from '../../src/milo';
import { LINES, ORDER } from '../content';

export function Playground() {
  const [variant, setVariant] = useState<MiloStyleId>(RECOMMENDED_STYLE);
  const [state, setState] = useState<MiloState>('idle');
  const [size, setSize] = useState<'sm' | 'md' | 'lg'>('lg');
  const [line, setLine] = useState(LINES.plan);
  const [speakingNow, setSpeakingNow] = useState('');
  return (
    <div className="sheet">
      <h1 className="sheet-title">
        MILO <span>// playground</span>
      </h1>
      <div className="controls">
        {ORDER.map((v) => (
          <button key={v} className={v === variant ? 'on' : ''} onClick={() => setVariant(v)}>
            {STYLES[v].name}
          </button>
        ))}
        <span className="gap" />
        {(['idle', 'thinking', 'alert'] as MiloState[]).map((s) => (
          <button
            key={s}
            className={s === state && !speakingNow ? 'on' : ''}
            onClick={() => {
              setSpeakingNow('');
              setState(s);
            }}
          >
            {s}
          </button>
        ))}
        <button
          className={speakingNow ? 'on' : ''}
          onClick={() => {
            setState('speaking');
            setSpeakingNow(line);
          }}
        >
          speak
        </button>
        <span className="gap" />
        {(['sm', 'md', 'lg'] as const).map((s) => (
          <button key={s} className={s === size ? 'on' : ''} onClick={() => setSize(s)}>
            {s}
          </button>
        ))}
      </div>
      <input className="line-input" value={line} onChange={(e) => setLine(e.target.value)} />
      <div className="play">
        <MiloAvatar
          variant={variant}
          size={size}
          state={state}
          speaking={speakingNow}
          onSpeakEnd={() => {
            setSpeakingNow('');
            setState('idle');
          }}
        />
      </div>
      <p className="links">
        <a href="?view=options">options</a> · <a href={`?view=states&variant=${variant}`}>states</a> ·{' '}
        <a href={`?view=demo&variant=${variant}`}>demo loop</a> · <a href="?view=banner">social card</a> ·{' '}
        <a href="?view=banner&w=1500&h=500&layout=header">X header</a> · <a href="?view=square&n=1000">org avatar</a>
      </p>
    </div>
  );
}
