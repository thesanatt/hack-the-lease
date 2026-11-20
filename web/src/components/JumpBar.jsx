// JumpBar: a light in-page tab row, sticky under the top bar. Each item scrolls to a section by its heading text.
// Props:
//   items  [{ label, find }]  find = heading text to look for (case-insensitive, exact after trimming)
import { useState } from 'react';

const OFFSET = 56 + 48; // top bar plus this row

export default function JumpBar({ items }) {
  const [active, setActive] = useState(null);
  const jump = (it) => {
    const want = it.find.trim().toLowerCase();
    setActive(it.label);
    // Section headings first, then kicker text some sections still carry; never stat labels.
    for (const sel of ['main h2', 'main h3', 'main .qv-kicker', 'main [data-kicker]']) {
      for (const el of document.querySelectorAll(sel)) {
        const text = sel.includes('data-kicker') ? el.getAttribute('data-kicker') : el.textContent;
        if ((text || '').trim().toLowerCase() !== want) continue;
        const target = el.closest('section') || el;
        const y = target.getBoundingClientRect().top + window.scrollY - OFFSET;
        // Instant jump: smooth scrolling can stall on a busy laptop or a background tab.
        window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
        return;
      }
    }
  };
  return (
    <nav className="jumpbar" aria-label="Sections on this page">
      {items.map((it) => (
        <button key={it.label} type="button" className="jumpbar-link" aria-current={active === it.label ? 'true' : undefined}
          onClick={() => jump(it)}>{it.label}</button>
      ))}
    </nav>
  );
}
