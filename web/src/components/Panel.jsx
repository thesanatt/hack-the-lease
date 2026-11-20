// Panel: one section of a page. Calm by default: no rule, a plain heading, room to breathe.
// Props:
//   title   string or node (Plex Sans, 20 px)
//   kicker  accepted for older callers and not drawn: default screens carry no kicker lines
//   aside   node at the right end of the header (quiet buttons, a chip) (optional)
//   right   same as aside (older callers)
//   lead    one short sentence under the heading (optional)
//   boxed   bool, sets the content on a plain white card
//   id, className, style  passed to the <section>
//   children
export default function Panel({ title, kicker, aside, right, lead, boxed = false, id, className = '', style, children }) {
  const end = aside ?? right;
  return (
    <section id={id} className={`panel${boxed ? ' boxed' : ''}${className ? ` ${className}` : ''}`} style={style}
      data-kicker={typeof kicker === 'string' ? kicker : undefined}>
      {(title || end) && (
        <header className="panel-head">
          {title && <h2>{title}</h2>}
          {end && <div className="panel-aside">{end}</div>}
        </header>
      )}
      {lead && <p className="panel-lead">{lead}</p>}
      {children}
    </section>
  );
}
