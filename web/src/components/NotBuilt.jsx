// NotBuilt: the calm note a view shows when an engine module is not in the build yet.
// Props:
//   module  engine file name without .js, e.g. 'fair'
//   what    what would appear here, e.g. 'the envy-free rent split'
export default function NotBuilt({ module, what }) {
  const lead = typeof what === 'string' && what ? what[0].toUpperCase() + what.slice(1) : what;
  return (
    <div className="empty warn" role="status">
      <span className="caps">Not built yet</span>
      <span>{lead} needs <code>engine/{module}.js</code>, which is not in this build. The rest of the page still works.</span>
    </div>
  );
}
