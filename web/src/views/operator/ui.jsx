// Small shared pieces for the Owners charts: a measured width and one hover/focus tooltip per chart.
import React, { useCallback, useEffect, useRef, useState } from 'react';

export function useWidth(fallback = 640) {
  const ref = useRef(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const set = () => setW(Math.max(260, Math.round(el.clientWidth)));
    set();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// Tooltip anchored inside a position:relative wrapper. show(evt, lines) works for mouse and keyboard focus.
export function useTip() {
  const wrap = useRef(null);
  const [tip, setTip] = useState(null);
  const show = useCallback((e, lines) => {
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return;
    let x, y;
    if (e && e.clientX != null && e.type !== 'focus') { x = e.clientX - box.left; y = e.clientY - box.top; }
    else {
      const r = e?.currentTarget?.getBoundingClientRect?.();
      x = r ? r.left + r.width / 2 - box.left : box.width / 2;
      y = r ? r.top - box.top : 0;
    }
    setTip({ x, y, lines, flip: x > box.width - 220 });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  const el = tip ? (
    <div className="ow-tip" role="status" style={{ left: tip.x, top: tip.y, transform: `translate(${tip.flip ? 'calc(-100% - 12px)' : '12px'}, calc(-100% - 8px))` }}>
      {tip.lines.map((l, i) => <div key={i} className={i === 0 ? 'ow-tip-h' : ''}>{l}</div>)}
    </div>
  ) : null;
  return { wrap, el, show, hide };
}
