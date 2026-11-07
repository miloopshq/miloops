import { Sprite } from '../../src/scout';

const PINE = [
  '....P....',
  '...PPP...',
  '...PpP...',
  '..PPPPP..',
  '..PPpPP..',
  '.PPPPPPP.',
  '.PPpPpPP.',
  'PPPPPPPPP',
  '....T....',
  '....T....',
];
const COLORS = { P: '#b4c89e', p: '#a3bb8d', T: '#bfae8e' };
/** Tree positions as fractions of the banner. */
const TREES = [
  [0.03, 0.08],
  [0.09, 0.14],
  [0.47, 0.05],
  [0.56, 0.11],
  [0.78, 0.06],
  [0.88, 0.13],
  [0.94, 0.04],
  [0.04, 0.82],
  [0.31, 0.86],
  [0.62, 0.84],
];

/** The banner's faint landscape: a few pines, the dashed trail, and the X at its end. */
export function BannerLand({ w, h }: { w: number; h: number }) {
  const u = h / 640;
  return (
    <>
      {TREES.map(([x, y]) => (
        <div key={`${x}-${y}`} className="banner-tree" style={{ left: x * w, top: y * h }}>
          <Sprite rows={PINE} palette={COLORS} scale={Math.max(2, Math.round(5 * u))} />
        </div>
      ))}
      <svg className="banner-land" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <path
          d={`M${w * 0.14} ${h} C${w * 0.3} ${h * 0.78} ${w * 0.55} ${h * 1.02} ${w * 0.72} ${h * 0.88} S${w * 0.86} ${h * 0.82} ${w * 0.92} ${h * 0.84}`}
          fill="none"
          stroke="#4a5249"
          strokeWidth={Math.max(2, 5 * u)}
          strokeDasharray={`${14 * u} ${11 * u}`}
        />
        <g
          transform={`translate(${w * 0.955} ${h * 0.84}) scale(${u})`}
          fill="none"
          stroke="#c8581e"
          strokeWidth="9"
          strokeLinecap="round"
        >
          <path d="M-26 -28C-16 -18 3 6 27 29" />
          <path d="M28 -27C11 -14 -10 8 -28 30" />
        </g>
      </svg>
    </>
  );
}
