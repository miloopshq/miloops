import { useEffect, useState } from 'react';
import { BANNER_LOOP } from '../content';
import { Banner } from './Banner';

declare global {
  interface Window {
    /** Set by `?view=banner&loop=1`: shows BANNER_LOOP step `step` frozen `at` ms in, for frame-by-frame GIF capture. */
    __bannerFrame?: (step: number, at: number) => void;
    /** Length in ms of each BANNER_LOOP step. */
    __bannerSteps?: number[];
  }
}

/** The card banner driven frame by frame through `window.__bannerFrame`; `data-frame` confirms the frame rendered. */
export function BannerLoop(props: { w: number; h: number; wordmark: string }) {
  const [f, setF] = useState({ step: 0, at: 0 });
  useEffect(() => {
    window.__bannerFrame = (step, at) => setF({ step, at });
    window.__bannerSteps = BANNER_LOOP.map((s) => s.ms);
    return () => {
      delete window.__bannerFrame;
      delete window.__bannerSteps;
    };
  }, []);
  const s = BANNER_LOOP[f.step];
  return (
    <div data-frame={`${f.step}:${f.at}`}>
      <Banner {...props} layout="card" frame={{ state: s.state, speaking: s.speaking, at: f.at }} />
    </div>
  );
}
