import { MiloAvatar, RECOMMENDED_STYLE, STYLES } from '../../src/milo';
import { LINES, SPEAK_AT, ORDER } from '../content';

export function Options() {
  return (
    <div className="sheet" data-capture="options">
      <h1 className="sheet-title">
        MILO <span>// renderings</span>
      </h1>
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
