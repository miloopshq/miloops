import { useEffect, useRef, type RefObject } from 'react';

type Point = { x: number; y: number };
type GestureEvent = UIEvent & { scale: number; clientX: number; clientY: number };

/**
 * Wheel and trackpad zoom for the map. React's onWheel is passive, so a trackpad pinch
 * (a wheel event with ctrlKey) also zoomed the whole page; a native non-passive listener
 * stops that. Safari sends pinches as gesture events instead, handled the same way.
 */
export function useWheelZoom(box: RefObject<HTMLElement | null>, zoomBy: (factor: number, at: Point) => void) {
  const zoom = useRef(zoomBy);
  zoom.current = zoomBy;
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const at = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Pinch deltas are small and frequent; mouse wheel steps are large.
      const rate = e.ctrlKey ? 0.01 : 0.0015;
      zoom.current(Math.exp(-e.deltaY * rate), at(e));
    };
    let lastScale = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      lastScale = 1;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as GestureEvent;
      zoom.current(g.scale / lastScale, at(g));
      lastScale = g.scale;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', onGestureStart, { passive: false });
    el.addEventListener('gesturechange', onGestureChange, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGestureStart);
      el.removeEventListener('gesturechange', onGestureChange);
    };
  }, [box]);
}
