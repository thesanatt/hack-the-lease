// Empty: the calm box a section shows while it waits for data, or when there is nothing to show yet.
// No spinner, so it reads the same with reduced motion.
// Props:
//   label     short word in front, e.g. 'Computing' (default 'Nothing yet')
//   tone      '' | 'warn' | 'bad'
//   children  one plain sentence
export default function Empty({ label = 'Nothing yet', tone = '', children }) {
  return (
    <div className={`empty${tone ? ` ${tone}` : ''}`} role="status">
      <span className="empty-label">{label}</span>
      <span>{children}</span>
    </div>
  );
}
