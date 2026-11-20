// JumpBar: a sticky row of links that scroll to a section by its heading text, so a presenter never hunts
// for a table on a long page.
// Props:
//   items  [{ label, find }]  find = heading text to look for (case-insensitive, exact after trimming)
export default function JumpBar({ items }) {
  const jump = (find) => {
    const want = find.trim().toLowerCase();
    // Section headings first, then the small kicker lines above some titles; never stat labels.
    for (const sel of ['main h2', 'main h3', 'main .qv-kicker']) {
      for (const el of document.querySelectorAll(sel)) {
        if (el.textContent.trim().toLowerCase() !== want) continue;
        const target = el.closest('section') || el;
        const y = target.getBoundingClientRect().top + window.scrollY - 52;
        // Instant jump: smooth scrolling can stall on a busy laptop or a background tab.
        window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
        return;
      }
    }
  };
  return (
    <nav className="jumpbar" aria-label="Jump to a section">
      <span className="jumpbar-label">Jump to</span>
      {items.map((it) => (
        <button key={it.label} type="button" className="jumpbar-link" onClick={() => jump(it.find)}>{it.label}</button>
      ))}
    </nav>
  );
}
