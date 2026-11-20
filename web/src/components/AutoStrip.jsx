// A WeekStrip drawn at the width of its slot. Passing a fixed width makes the SVG scale down inside narrow cards,
// which shrinks its day letters and marks below readable size; measuring the slot keeps them at their set size.
// Props: everything WeekStrip takes except width; fallback = width before the first measure.
import { useEffect, useRef, useState } from 'react';
import WeekStrip from './WeekStrip.jsx';

export default function AutoStrip({ fallback = 440, ...props }) {
  const ref = useRef(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const set = () => { const cw = Math.round(el.clientWidth); if (cw > 40) setW(cw); };
    set();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <div ref={ref} style={{ width: '100%' }}><WeekStrip {...props} width={w} /></div>;
}
