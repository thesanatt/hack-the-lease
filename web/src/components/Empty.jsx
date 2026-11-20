// Empty: the calm box a panel shows while it waits for data, or when there is nothing to show yet.
// It says what will appear here and why it is not here yet. No spinner, so it reads the same with reduced motion.
// Props:
//   label     small caps word in front, e.g. 'Computing' or 'Nothing yet' (default 'Nothing yet')
//   tone      '' | 'warn' | 'bad' (left rule color)
//   children  one plain sentence
export default function Empty({ label = 'Nothing yet', tone = '', children }) {
  return (
    <div className={`empty ${tone}`} role="status">
      <span className="caps">{label}</span>
      <span>{children}</span>
    </div>
  );
}
