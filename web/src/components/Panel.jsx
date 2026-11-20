// Panel: a section of the page under a heavy rule, like a timetable block.
// Props:
//   title   string or node, set in the display serif
//   kicker  short gray line next to the title (optional)
//   aside   node placed at the right end of the header (buttons, pills) (optional)
//   boxed   bool, adds a paper-2 box around the content
//   id, className, style  passed to the <section>
//   children
export default function Panel({ title, kicker, aside, boxed = false, id, className = '', style, children }) {
  return (
    <section id={id} className={`panel ${boxed ? 'boxed' : ''} ${className}`} style={style}>
      {(title || kicker || aside) && (
        <header className="panel-head">
          {title && <h2>{title}</h2>}
          {kicker && <span className="panel-kicker">{kicker}</span>}
          {aside && <div className="panel-aside">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
